// test/test-import.ts
import cds from '@sap/cds';
import { MDBImporter } from '../srv/importers/mdb-importer.js';
import { JSONImporter } from '../srv/importers/json-importer.js';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG = cds.log('test-import');
const { SELECT } = cds.ql;

async function testImport() {
  try {
    LOG.info('🚀 Starting Import Test');
    
    // Projekt-Root und DB-Pfad
    const projectRoot = resolve(__dirname, '..');
    const dbPath = join(projectRoot, 'db.sqlite');
    
    LOG.info(`📂 Project root: ${projectRoot}`);
    LOG.info(`📂 Database: ${dbPath}`);
    
    if (!existsSync(dbPath)) {
      LOG.error(`❌ Database file not found: ${dbPath}`);
      LOG.info('💡 Run: npm run db:deploy');
      process.exit(1);
    }
    
    // ✅ 1. Erst DB-Config setzen
    cds.env.requires.db = {
      kind: 'sqlite',
      credentials: { url: dbPath }
    };
    
    LOG.info('📦 Loading CDS model...');
    
    // ✅ 2. Model laden
    const csn = await cds.load('*');
    
    // ✅ 3. Model an cds.model zuweisen (wichtig!)
    cds.model = csn;
    
    LOG.info('✅ Model loaded');
    
    // ✅ 4. JETZT erst DB verbinden (mit geladenem Model)
    LOG.info('🔌 Connecting to database...');
    await cds.connect.to('db');
    
    LOG.info('✅ CDS initialized');
    
    // Prüfe DB-Verbindung
    try {
      await SELECT.from('shipinfo.tblStatusCodes').limit(1);
      LOG.info('✅ Database ready');
    } catch (error) {
      LOG.error('❌ Database not ready - tables missing?');
      
      // Debug: Zeige verfügbare Tabellen
      const db = await cds.connect.to('db');
      try {
        const tables = await db.run(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
        LOG.info('Available tables:', tables.map((t: any) => t.name).join(', '));
      } catch (e) {
        LOG.error('Could not list tables');
      }
      
      throw error;
    }
    
    const mode = process.argv.find(arg => arg.startsWith('--mode='))?.split('=')[1] || 'mdb';
    
    if (mode === 'mdb') {
      LOG.info('=== MDB Full Import ===');
      
      const mdbFilePath = join(projectRoot, 'test', 'ShipData.mdb');
      LOG.info(`📂 MDB File: ${mdbFilePath}`);
      
      if (!existsSync(mdbFilePath)) {
        LOG.error(`❌ MDB file not found: ${mdbFilePath}`);
        process.exit(1);
      }
      
      const importer = new MDBImporter();
      const result = await importer.importAll(mdbFilePath);
      
      LOG.info('');
      LOG.info('📊 Import Result:');
      LOG.info(`   Success: ${result.success}`);
      LOG.info(`   Duration: ${(result.duration! / 1000).toFixed(2)}s`);
      LOG.info(`   Tables: ${Object.keys(result.stats || {}).length}`);
      
      if (result.stats) {
        LOG.info('');
        LOG.info('📋 Table Statistics:');
        let totalRows = 0;
        let successCount = 0;
        let errorCount = 0;
        
        for (const [table, stat] of Object.entries(result.stats)) {
          const status = stat.error ? '❌' : '✅';
          const info = stat.error 
            ? `Error: ${stat.error}` 
            : `${stat.rows.toLocaleString()} rows in ${(stat.duration / 1000).toFixed(1)}s`;
          LOG.info(`   ${status} ${table}: ${info}`);
          
          if (!stat.error) {
            totalRows += stat.rows;
            successCount++;
          } else {
            errorCount++;
          }
        }
        
        LOG.info('');
        LOG.info('📈 Summary:');
        LOG.info(`   Total rows imported: ${totalRows.toLocaleString()}`);
        LOG.info(`   Successful tables: ${successCount}`);
        LOG.info(`   Failed tables: ${errorCount}`);
      }
      
    } else if (mode === 'delta') {
      LOG.info('=== JSON Delta Import ===');
      
      const jsonFilePath = join(projectRoot, 'test', 'data', 'delta-update.json');
      LOG.info(`📂 JSON File: ${jsonFilePath}`);
      
      if (!existsSync(jsonFilePath)) {
        LOG.error(`❌ JSON file not found: ${jsonFilePath}`);
        process.exit(1);
      }
      
      const importer = new JSONImporter();
      const result = await importer.importDelta(jsonFilePath);
      
      LOG.info('');
      LOG.info('📊 Import Result:');
      LOG.info(`   Success: ${result.success}`);
      LOG.info(`   Updated: ${result.updated}`);
      LOG.info(`   Inserted: ${result.inserted}`);
      LOG.info(`   Errors: ${result.errors}`);
      LOG.info(`   Duration: ${result.duration}ms`);
      
    } else {
      LOG.error(`❌ Unknown mode: ${mode}`);
      LOG.info('Usage: npm run test:import:mdb or npm run test:import:delta');
      process.exit(1);
    }
    
    LOG.info('');
    LOG.info('✅ Test completed successfully!');
    process.exit(0);
    
  } catch (error) {
    LOG.error('');
    LOG.error('❌ Test failed:', error);
    if (error instanceof Error && error.stack) {
      LOG.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

testImport();
