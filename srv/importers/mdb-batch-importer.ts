// srv/importers/mdb-batch-importer.ts
import cds from '@sap/cds';
import { readTableInBatches, listTables } from '../utils/mdb-batch-reader.js';
import { TABLE_MAPPING, IMPORT_ORDER, transformRow } from './table-mapper.js';
import type { ImportResult, ImportStats } from '../types/index.js';
import { existsSync, statSync } from 'fs';

const { DELETE, INSERT } = cds.ql;
const LOG = cds.log('mdb-batch-importer');

export class MDBBatchImporter {
  private stats: Record<string, ImportStats> = {};
  
  /**
   * Memory-Status loggen
   */
  private logMemory(context: string): void {
    const mem = process.memoryUsage();
    const heapUsed = (mem.heapUsed / 1024 / 1024).toFixed(0);
    const heapTotal = (mem.heapTotal / 1024 / 1024).toFixed(0);
    const rss = (mem.rss / 1024 / 1024).toFixed(0);
    LOG.info(`💾 ${context}: Heap ${heapUsed}/${heapTotal} MB, RSS ${rss} MB`);
  }
  
  /**
   * Import aller Tabellen aus MDB
   */
  async importAll(mdbPath: string): Promise<ImportResult> {
    const startTime = Date.now();
    this.stats = {};
    
    LOG.info('🚀 Starting MDB batch import from:', mdbPath);
    this.logMemory('Start');
    
    // ✅ Validate database connection
    await this.validateDatabase();
    
    // ✅ DB-spezifische Optimierung
    await this.optimizeDatabase();
    
    // Liste verfügbare Tabellen
    const availableTables = listTables(mdbPath);
    LOG.info(`📂 MDB enthält ${availableTables.length} Tabellen`);
    
    // Importiere in korrekter Reihenfolge
    for (const tableName of IMPORT_ORDER) {
      if (!availableTables.includes(tableName)) {
        LOG.warn(`⚠️  ${tableName} nicht in MDB - überspringe`);
        continue;
      }
      
      await this.importTable(mdbPath, tableName);
      
      // Garbage Collection nach jeder Tabelle
      if (global.gc) {
        global.gc();
        this.logMemory(`Nach GC (${tableName})`);
      }
    }
    
    const duration = Date.now() - startTime;
    LOG.info(`✅ Import abgeschlossen in ${(duration / 1000).toFixed(2)}s`);
    this.logMemory('Ende');
    
    return {
      success: true,
      duration,
      stats: this.stats,
      message: `${Object.keys(this.stats).length} Tabellen importiert`
    };
  }
  
  /**
   * ✅ Validate database connection and log details
   */
  private async validateDatabase(): Promise<void> {
    try {
      LOG.info('🔍 Validating database connection...');
      
      const db = await cds.connect.to('db');
      
      if (!db) {
        throw new Error('Database connection failed - cds.db is null');
      }
      
      // ✅ Log environment info
      const profile = cds.env.env || process.env.CDS_ENV || process.env.NODE_ENV || 'development';
      const vcapServices = process.env.VCAP_SERVICES ? 'present' : 'not found';
      const defaultEnvFile = existsSync('./default-env.json') ? 'present' : 'not found';
      const privateConfig = existsSync('./.cdsrc-private.json') ? 'present' : 'not found';
      
      LOG.info('');
      LOG.info('🌍 Environment:');
      LOG.info(`   Active Profile: ${profile}`);
      LOG.info(`   All Profiles: ${Array.from(cds.env._profiles || []).join(', ')}`);
      LOG.info(`   VCAP_SERVICES: ${vcapServices}`);
      LOG.info(`   default-env.json: ${defaultEnvFile}`);
      LOG.info(`   .cdsrc-private.json: ${privateConfig}`);
      LOG.info('');
      
      // Log database details
      LOG.info('📊 Database Configuration:');
      LOG.info(`   Type: ${db.kind}`);
      LOG.info(`   Implementation: ${db.constructor.name}`);
      LOG.info(`   Driver: ${cds.env.requires?.db?.impl || 'unknown'}`);
      
      // SQLite specific info
      if (db.kind === 'sqlite') {
        const dbUrl = (db as any).options?.credentials?.url || cds.env.requires?.db?.credentials?.url || 'unknown';
        LOG.info(`   File: ${dbUrl}`);
        
        // Check if file exists
        if (existsSync(dbUrl)) {
          const stats = statSync(dbUrl);
          const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
          LOG.info(`   Size: ${sizeMB} MB`);
        }
        
        // Test query
        try {
          const result = await db.run('SELECT sqlite_version() as version');
          if (result && result[0]) {
            LOG.info(`   Version: SQLite ${result[0].version}`);
          }
        } catch (err) {
          LOG.warn(`   Version check failed: ${err instanceof Error ? err.message : 'unknown'}`);
        }
      }
      
      // HANA specific info
      else if (db.kind === 'hana') {
        // Get binding info from config
        const binding = cds.env.requires?.db?.binding;
        if (binding) {
          LOG.info(`   Binding Type: ${binding.type}`);
          LOG.info(`   CF Org: ${binding.org}`);
          LOG.info(`   CF Space: ${binding.space}`);
          LOG.info(`   Service Instance: ${binding.instance}`);
          LOG.info(`   Service Key: ${binding.key}`);
        }
        
        // Get HANA connection details from actual credentials
        let credentials: any = {};
        
        // Try to get from VCAP_SERVICES
        if (process.env.VCAP_SERVICES) {
          try {
            const vcap = JSON.parse(process.env.VCAP_SERVICES);
            const hanaServices = vcap.hana || vcap['hanatrial'] || [];
            if (hanaServices.length > 0) {
              credentials = hanaServices[0].credentials || {};
            }
          } catch (err) {
            LOG.warn(`   Could not parse VCAP_SERVICES`);
          }
        }
        
        // Fallback to db options
        if (!credentials.host) {
          credentials = (db as any).options?.credentials || {};
        }
        
        const schema = credentials.schema || process.env.HDI_CONTAINER_NAME || 'unknown';
        const host = credentials.host || credentials.hostname || 'unknown';
        const port = credentials.port || 'unknown';
        
        LOG.info(`   Host: ${host}:${port}`);
        LOG.info(`   Schema: ${schema}`);
        
        // Try to get HANA version
        try {
          const result = await db.run('SELECT VERSION FROM SYS.M_DATABASE');
          if (result && result[0]) {
            LOG.info(`   Version: HANA ${result[0].VERSION}`);
          }
        } catch (err) {
          LOG.info(`   Version: HANA Cloud (version query requires permissions)`);
        }
        
        // Check if HDI container
        if (schema.includes('_HDI_') || schema.includes('_DEPLOYER_')) {
          LOG.info(`   Mode: HDI Container`);
        } else {
          LOG.info(`   Mode: Classic Schema`);
        }
        
        // Connection status
        try {
          const result = await db.run('SELECT CURRENT_USER, CURRENT_SCHEMA FROM DUMMY');
          if (result && result[0]) {
            LOG.info(`   Connected User: ${result[0].CURRENT_USER}`);
            LOG.info(`   Current Schema: ${result[0].CURRENT_SCHEMA}`);
          }
        } catch (err) {
          LOG.warn(`   Connection test failed: ${err instanceof Error ? err.message : 'unknown'}`);
        }
      }
      
      // Other databases
      else {
        const creds = (db as any).options?.credentials || {};
        if (creds.host) {
          LOG.info(`   Host: ${creds.host}`);
        }
        if (creds.database) {
          LOG.info(`   Database: ${creds.database}`);
        }
      }
      
      // Connection pool info (if available)
      if ((db as any).pool) {
        const pool = (db as any).pool;
        LOG.info(`   Connection Pool:`);
        LOG.info(`     - max: ${pool.max || 'N/A'}`);
        LOG.info(`     - min: ${pool.min || 'N/A'}`);
        if (pool.acquireTimeoutMillis) {
          LOG.info(`     - acquire timeout: ${pool.acquireTimeoutMillis}ms`);
        }
      }
      
      LOG.info('');
      LOG.info('✅ Database connection validated successfully');
      LOG.info('');
      
    } catch (error) {
      LOG.error('');
      LOG.error('❌ Database connection validation failed!');
      LOG.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
      LOG.error('');
      LOG.error('💡 Possible solutions:');
      
      const profile = cds.env.env || process.env.CDS_ENV || process.env.NODE_ENV || 'development';
      
      if (profile === 'development' || !process.env.VCAP_SERVICES) {
        LOG.error('   SQLite:');
        LOG.error('     1. Run: npm run db:deploy');
        LOG.error('     2. Check: db.sqlite file exists');
        LOG.error('');
        LOG.error('   HANA Hybrid:');
        LOG.error('     1. Set profile: export CDS_ENV=hybrid');
        LOG.error('     2. Bind service: cds bind -2 ship-info-hana:ship-info-hana-dev-key');
        LOG.error('     3. Check: cat default-env.json');
      } else {
        LOG.error('   HANA Cloud:');
        LOG.error('     1. Check service: cds env get requires.db');
        LOG.error('     2. Verify credentials: cf service-key ship-info-hana ship-info-hana-dev-key');
        LOG.error('     3. Re-bind: cds bind -2 ship-info-hana:ship-info-hana-dev-key');
        LOG.error('     4. Check VCAP: echo $VCAP_SERVICES');
      }
      
      LOG.error('');
      
      throw new Error('Database connection validation failed. Import aborted.');
    }
  }
  
  /**
   * ✅ Database-spezifische Optimierung (SQLite oder HANA)
   */
  private async optimizeDatabase(): Promise<void> {
    try {
      const db = await cds.connect.to('db');
      
      LOG.info('⚙️  Optimizing database for bulk import...');
      
      if (db.kind === 'sqlite') {
        // SQLite-spezifische Optimierungen
        await db.run('PRAGMA journal_mode = WAL');
        await db.run('PRAGMA synchronous = NORMAL');
        await db.run('PRAGMA cache_size = -64000'); // 64MB Cache
        await db.run('PRAGMA temp_store = MEMORY');
        
        LOG.info('   ✓ WAL mode enabled');
        LOG.info('   ✓ Sync mode: NORMAL');
        LOG.info('   ✓ Cache size: 64 MB');
        LOG.info('   ✓ Temp store: MEMORY');
        LOG.info('✅ SQLite optimized for bulk insert');
      } else if (db.kind === 'hana') {
        // HANA benötigt keine speziellen Optimierungen
        // Auto-Commit ist bereits optimal für Bulk-Insert
        LOG.info('   ✓ Using native HANA bulk insert');
        LOG.info('   ✓ Auto-commit enabled');
        LOG.info('   ✓ Batch size: 10000 rows');
        LOG.info('✅ HANA ready for bulk insert');
      } else {
        LOG.info(`✅ Database ready: ${db.kind}`);
      }
      
      LOG.info('');
      
    } catch (error) {
      LOG.warn('⚠️  Database optimization failed (continuing anyway)');
      LOG.warn(`   ${error instanceof Error ? error.message : String(error)}`);
      LOG.info('');
    }
  }
  
  /**
   * Import einer einzelnen Tabelle via Batch-Reader
   */
  async importTable(mdbPath: string, tableName: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      const entityName = TABLE_MAPPING[tableName];
      if (!entityName) {
        LOG.warn(`⚠️  ${tableName}: kein Mapping definiert`);
        return;
      }
      
      LOG.info(`📥 ${tableName}: Batch-Import startet...`);
      
      // Get DB connection
      const db = await cds.connect.to('db');
      
      // Alte Daten löschen
      await DELETE.from(entityName);
      
      let insertedTotal = 0;
      let lastLogTime = Date.now();
      
      // DB-spezifische Batch-Größe
      const BATCH_SIZE = db.kind === 'hana' ? 10000 : 5000;
      
      // Batch-Import
      await readTableInBatches(
        mdbPath,
        { 
          table: tableName, 
          batchSize: BATCH_SIZE 
        },
        async (rows) => {
          // Transform Batch
          const transformedRows = rows.map(transformRow);
          
          // Insert Batch
          if (transformedRows.length > 0) {
            await INSERT.into(entityName).entries(transformedRows);
            insertedTotal += transformedRows.length;
            
            // Progress-Logging (max alle 2 Sekunden)
            const now = Date.now();
            if (insertedTotal % 10000 === 0 && (now - lastLogTime) > 2000) {
              const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0);
              const rss = (process.memoryUsage().rss / 1024 / 1024).toFixed(0);
              const rowsPerSec = Math.round(insertedTotal / ((now - startTime) / 1000));
              LOG.info(`   📊 ${tableName}: ${insertedTotal.toLocaleString()} rows - ${rowsPerSec} rows/s - Heap ${mem} MB, RSS ${rss} MB`);
              lastLogTime = now;
            }
          }
        }
      );
      
      // Stats sammeln
      const duration = Date.now() - startTime;
      this.stats[tableName] = { tableName, rows: insertedTotal, duration };
      
      // Success-Log
      const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0);
      const rss = (process.memoryUsage().rss / 1024 / 1024).toFixed(0);
      const avgSpeed = Math.round(insertedTotal / (duration / 1000));
      LOG.info(`✅ ${tableName}: ${insertedTotal.toLocaleString()} rows in ${(duration / 1000).toFixed(1)}s (${avgSpeed} rows/s) - Heap ${mem} MB, RSS ${rss} MB`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      LOG.error(`❌ ${tableName}:`, errorMessage);
      
      this.stats[tableName] = { 
        tableName, 
        rows: 0, 
        duration: 0, 
        error: errorMessage 
      };
    }
  }
}
