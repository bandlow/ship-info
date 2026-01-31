// test/test-import-mdb-batch.ts
import cds from '@sap/cds';
import { MDBBatchImporter } from '../srv/importers/mdb-batch-importer.js';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync } from 'fs';
import type { ImportStats } from '../srv/types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG = cds.log('test-mdb-batch');
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
    LOG.info('🚀 Starting MDB Batch Import Test');
    logMemory('Start');
    
    const projectRoot = resolve(__dirname, '..');
    const dbPath = join(projectRoot, 'db.sqlite');
    const mdbPath = join(projectRoot, 'test', 'ShipData.mdb');
    
    if (!existsSync(dbPath)) {
      LOG.error(`❌ Database file not found: ${dbPath}`);
      LOG.info('💡 Run: npm run db:deploy');
      process.exit(1);
    }
    
    if (!existsSync(mdbPath)) {
      LOG.error(`❌ MDB file not found: ${mdbPath}`);
      process.exit(1);
    }
    
    // DB-Config
    cds.env.requires.db = {
      kind: 'sqlite',
      credentials: { url: dbPath }
    };
    
    // Model laden
    LOG.info('📦 Loading CDS model...');
    const csn = await cds.load('*');
    (cds as any).model = csn;
    
    await cds.connect.to('db');
    LOG.info('✅ CDS initialized');
    logMemory('Nach Init');
    
    // Check DB ready
    try {
      await SELECT.from('shipinfo.tblStatusCodes').limit(1);
      LOG.info('✅ Database ready');
    } catch (error) {
      LOG.error('❌ Database not ready - tables missing?');
      throw error;
    }
    
    // MDB Batch Import
    LOG.info('');
    LOG.info('=== MDB Batch Import ===');
    
    const importer = new MDBBatchImporter();
    const result = await importer.importAll(mdbPath);
    
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
      LOG.info(`   Total rows imported: ${totalRows.toLocaleString()}`);
      LOG.info(`   Successful tables: ${successCount}`);
      LOG.info(`   Failed tables: ${errorCount}`);
      if (totalDuration > 0) {
        LOG.info(`   Avg speed: ${Math.round(totalRows / (totalDuration / 1000))} rows/s`);
      }
    }
    
    LOG.info('');
    logMemory('Nach Import');
    
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

testMDBBatchImport();
