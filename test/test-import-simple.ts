// test/test-import.ts
import cds from '@sap/cds';
import { MDBImporter } from '../srv/importers/mdb-importer.js';
import { JSONImporter } from '../srv/importers/json-importer.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testImport() {
  try {
    console.log('🚀 Starting Import Test...\n');
    
    // ✅ cds.test() mit __dirname
    console.log('📦 Initializing CDS environment...');
    await cds.test(__dirname);
    console.log('✅ CDS environment ready\n');
    
    // Lese Command-Line-Argument
    const mode = process.argv.find(arg => arg.startsWith('--mode='))?.split('=')[1] || 'mdb';
    
    if (mode === 'mdb') {
      // MDB Full Import
      console.log('=== MDB Full Import ===\n');
      
      const mdbFilePath = './test/ShipData.mdb';
      console.log(`📂 MDB File: ${mdbFilePath}\n`);
      
      const importer = new MDBImporter();
      const result = await importer.importAll(mdbFilePath);
      
      console.log('\n📊 Import Result:');
      console.log(`   Success: ${result.success}`);
      console.log(`   Duration: ${(result.duration! / 1000).toFixed(2)}s`);
      console.log(`   Tables: ${Object.keys(result.stats || {}).length}`);
      
      if (result.stats) {
        console.log('\n📋 Table Statistics:');
        let totalRows = 0;
        let successCount = 0;
        let errorCount = 0;
        
        for (const [table, stat] of Object.entries(result.stats)) {
          const status = stat.error ? '❌' : '✅';
          const info = stat.error 
            ? `Error: ${stat.error}` 
            : `${stat.rows.toLocaleString()} rows in ${(stat.duration / 1000).toFixed(1)}s`;
          console.log(`   ${status} ${table}: ${info}`);
          
          if (!stat.error) {
            totalRows += stat.rows;
            successCount++;
          } else {
            errorCount++;
          }
        }
        
        console.log(`\n📈 Summary:`);
        console.log(`   Total rows imported: ${totalRows.toLocaleString()}`);
        console.log(`   Successful tables: ${successCount}`);
        console.log(`   Failed tables: ${errorCount}`);
      }
      
    } else if (mode === 'delta') {
      // JSON Delta Import
      console.log('=== JSON Delta Import ===\n');
      
      const jsonFilePath = './test/data/delta-update.json';
      console.log(`📂 JSON File: ${jsonFilePath}\n`);
      
      const importer = new JSONImporter();
      const result = await importer.importDelta(jsonFilePath);
      
      console.log('\n📊 Import Result:');
      console.log(`   Success: ${result.success}`);
      console.log(`   Updated: ${result.updated}`);
      console.log(`   Inserted: ${result.inserted}`);
      console.log(`   Errors: ${result.errors}`);
      console.log(`   Duration: ${result.duration}ms`);
      
    } else {
      console.error(`❌ Unknown mode: ${mode}`);
      console.log('Usage: npm run test:import:mdb or npm run test:import:delta');
      process.exit(1);
    }
    
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run test
testImport();
