import cds from '@sap/cds';
import { table } from '@el3um4s/node-mdb';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

(async () => {
  try {
    console.log('🚀 Stammdaten-Import:', new Date().toISOString());
    
    await cds.connect.to('db');
    console.log('✅ CAP DB connected');
    
    const mdbPath = join(__dirname, '../ShipData.mdb');
    if (!fs.existsSync(mdbPath)) {
      throw new Error(`❌ ShipData.mdb nicht gefunden: ${mdbPath}`);
    }
    
    console.log('📂 MDB:', mdbPath);
    
   const database = "../ShipData.mdb";

const result = await table.list({ database });
console.log(result);
    // **KORREKT**: Named Import!
    const mdbTable = table(mdbPath);
    
    // Tabellen finden
    mdbTable.query(`SELECT Name FROM MSysObjects WHERE Type=1 AND Flags=0`, (err, tablesResult) => {
      if (err) throw err;
      
      const tables = tablesResult.map(row => row.Name);
      console.log('📋 Tables found:', tables);
      
      let processed = 0;
      
      tables.forEach(tableName => {
        console.log(`🔄 Processing ${tableName}...`);
        
        mdbTable.query(`SELECT * FROM [${tableName}]`, async (err, rows) => {
          if (err) {
            console.error(`❌ ${tableName}:`, err.message);
            processed++;
            checkComplete();
            return;
          }
          
          const entityName = `skf.zcapn.shipimporter.${tableName}`;
          
          try {
            await cds.db.insert.into(entityName).entries(rows);
            console.log(`✅ Imported ${rows.length} rows: ${tableName}`);
          } catch (e) {
            console.error(`❌ Insert ${tableName}:`, e.message);
          }
          
          processed++;
          checkComplete();
        });
      });
      
      function checkComplete() {
        if (processed === tables.length) {
          console.log('🎉 ShipData.mdb import complete!');
        }
      }
    });
    
  } catch (error) {
    console.error('💥 Import failed:', error.message);
    process.exit(1);
  }
})();
