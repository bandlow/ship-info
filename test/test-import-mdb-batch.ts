// test/test-import-mdb-batch.ts
import cds from '@sap/cds';
import { MDBBatchImporter } from '../srv/importers/mdb-batch-importer.js';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync } from 'fs';
import type { ImportStats } from '../srv/types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG = cds.log('test-import');
const { SELECT } = cds.ql;

function logMemory(context: string): void {
  const mem = process.memoryUsage();
  const heapUsed = (mem.heapUsed / 1024 / 1024).toFixed(0);
  const heapTotal = (mem.heapTotal / 1024 / 1024).toFixed(0);
  const rss = (mem.rss / 1024 / 1024).toFixed(0);
  LOG.info(`💾 ${context}:`);
  LOG.info(`   Heap: ${heapUsed}/${heapTotal} MB`);
  LOG.info(`   RSS: ${rss} MB`);
}

async function testMDBBatchImport() {
  try {
    LOG.info('🚀 Starting MDB Import Test');
    logMemory('Start');
    
    const projectRoot = resolve(__dirname, '..');
    const mdbPath = join(projectRoot, 'downloads/full-import', 'ShipData.mdb');
    
    // Check MDB file
    if (!existsSync(mdbPath)) {
      LOG.error(`❌ MDB file not found: ${mdbPath}`);
      process.exit(1);
    }
    
    LOG.info(`📂 MDB: ${mdbPath}`);
    LOG.info('');
    
    // ✅ Force SQLite if USE_SQLITE env var is set
    if (process.env.USE_SQLITE === 'true') {
      const dbPath = join(projectRoot, 'db.sqlite');
      
      if (!existsSync(dbPath)) {
        LOG.error(`❌ SQLite database not found: ${dbPath}`);
        LOG.error('💡 Run: npm run db:deploy');
        process.exit(1);
      }
      
      LOG.info('🔧 Forcing SQLite database...');
      cds.env.requires.db = {
        kind: 'sqlite',
        impl: '@cap-js/sqlite',
        credentials: { url: dbPath }
      };
    }
    
    const profile = process.env.CDS_ENV || process.env.NODE_ENV || 'development';
    
    LOG.info('📦 Loading CDS model...');
    
    // ✅ CRITICAL: Load model and set it globally
    const csn = await cds.load('*');
    (cds as any).model = csn;
    
    LOG.info('🔗 Connecting to database...');
    const db = await cds.connect.to('db');
    
    LOG.info('');
    LOG.info('✅ CDS initialized');
    LOG.info(`   Database: ${db.kind}`);
    LOG.info(`   Profile: ${profile}`);
    LOG.info('');
    
    logMemory('Nach Init');
    
    // Check DB readiness
    /* try {
      await SELECT.from('shipinfo.ship').limit(1);
      LOG.info('✅ Database ready');
    } catch (error) {
      LOG.warn('⚠️  Database check: tables will be created during import');
    } */
    
    // === MDB Batch Import ===
    LOG.info('');
    LOG.info('=== Starting MDB Batch Import ===');
    LOG.info('');
    
    const importer = new MDBBatchImporter();
    const result = await importer.importAll(mdbPath);
    
    // === Results ===
    LOG.info('');
    LOG.info('=== Import Completed ===');
    LOG.info('');
    LOG.info('📊 Import Result:');
    LOG.info(`   Success: ${result.success ? '✅' : '❌'}`);
    LOG.info(`   Duration: ${(result.duration! / 1000).toFixed(2)}s`);
    LOG.info(`   Tables: ${Object.keys(result.stats || {}).length}`);
    
    if (result.stats) {
      LOG.info('');
      LOG.info('📋 Table Statistics:');
      
      let totalRows = 0;
      let successCount = 0;
      let errorCount = 0;
      let totalDuration = 0;
      
      for (const [table, stat] of Object.entries(result.stats)) {
        const s = stat as ImportStats;
        const status = s.error ? '❌' : '✅';
        const info = s.error 
          ? `Error: ${s.error}` 
          : `${s.rows.toLocaleString()} rows in ${(s.duration / 1000).toFixed(1)}s`;
        LOG.info(`   ${status} ${table}: ${info}`);
        
        if (!s.error) {
          totalRows += s.rows;
          totalDuration += s.duration;
          successCount++;
        } else {
          errorCount++;
        }
      }
      
      LOG.info('');
      LOG.info('📈 Summary:');
      LOG.info(`   Total rows: ${totalRows.toLocaleString()}`);
      LOG.info(`   Success: ${successCount} tables`);
      LOG.info(`   Errors: ${errorCount} tables`);
      
      if (totalDuration > 0 && totalRows > 0) {
        const avgSpeed = Math.round(totalRows / (totalDuration / 1000));
        LOG.info(`   Avg speed: ${avgSpeed.toLocaleString()} rows/s`);
      }
    }
    
    LOG.info('');
    logMemory('Nach Import');
    
    LOG.info('');
    LOG.info('✅ Import Test Completed!');
    process.exit(0);
    
  } catch (error) {
    LOG.error('');
    LOG.error('❌ Import Test Failed:', error);
    if (error instanceof Error && error.stack) {
      LOG.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

testMDBBatchImport();
