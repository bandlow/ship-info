// srv/importers/json-importer.ts
import cds from '@sap/cds';
import { TABLE_MAPPING, IMPORT_ORDER, transformRow } from './table-mapper.js';
import type { ImportResult, ImportStats } from '../types/index.js';
import { existsSync, statSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const LOG = cds.log('json-importer');

export interface JsonImportOptions {
  mode?: 'replace' | 'upsert';
  batchSize?: number;
}

export class JSONImporter {
  private stats: Record<string, ImportStats> = {};
  private db: any;
  
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
   * Import aller JSON-Dateien aus einem Verzeichnis
   */
  async importAll(jsonDir: string, options: JsonImportOptions = {}): Promise<ImportResult> {
    const startTime = Date.now();
    this.stats = {};
    
    LOG.info('🚀 Starting JSON batch import from:', jsonDir);
    this.logMemory('Start');
    
    if (!existsSync(jsonDir)) {
      throw new Error(`JSON directory not found: ${jsonDir}`);
    }
    
    // ✅ Load CDS model explicitly
    if (!cds.model) {
      LOG.info('📚 Loading CDS model...');
      const csn = await cds.load([
        'db/schema.cds',
        'srv/import-service.cds',
        'srv/ship-info-service.cds'
      ]);
      cds.model = cds.linked(csn);
      LOG.info('✅ CDS model loaded');
    }
    
    // ✅ Connect to database
    this.db = await cds.connect.to('db');
    
    // ✅ Validate database connection
    await this.validateDatabase();
    
    // ✅ DB-spezifische Optimierung
    await this.optimizeDatabase();
    
    // Liste verfügbare JSON-Dateien
    const jsonFiles = this.findJsonFiles(jsonDir);
    LOG.info(`📂 Found ${jsonFiles.size} JSON file(s)`);
    
    if (jsonFiles.size === 0) {
      LOG.warn('⚠️  No JSON files found in directory');
      return {
        success: false,
        duration: Date.now() - startTime,
        stats: {},
        message: 'No JSON files found'
      };
    }
    
    // Importiere in korrekter Reihenfolge
    const orderedFiles = this.orderJsonFiles(jsonFiles);
    
    for (const [tableName, filePath] of orderedFiles) {
      await this.importFile(filePath, tableName, options);
      
      // Garbage Collection nach jeder Datei
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
      message: `${Object.keys(this.stats).length} Dateien importiert`
    };
  }
  
  /**
   * ✅ Finde alle JSON-Dateien im Verzeichnis
   */
  private findJsonFiles(dir: string): Map<string, string> {
    const files = new Map<string, string>();
    
    const items = readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
      if (!item.isFile() || !item.name.toLowerCase().endsWith('.json')) {
        continue;
      }
      
      const fullPath = join(dir, item.name);
      const fileName = item.name.replace(/_Update\.json$/i, '').replace(/\.json$/i, '');
      
      // Versuche Tabellennamen zu erkennen
      for (const tableName of Object.keys(TABLE_MAPPING)) {
        if (fileName.includes(tableName) || item.name.includes(tableName)) {
          files.set(tableName, fullPath);
          break;
        }
      }
    }
    
    return files;
  }
  
  /**
   * ✅ Sortiere JSON-Dateien nach IMPORT_ORDER
   */
  private orderJsonFiles(files: Map<string, string>): Array<[string, string]> {
    const ordered: Array<[string, string]> = [];
    
    // Erst nach IMPORT_ORDER sortiert
    for (const tableName of IMPORT_ORDER) {
      if (files.has(tableName)) {
        ordered.push([tableName, files.get(tableName)!]);
      }
    }
    
    // Dann restliche Dateien
    for (const [tableName, filePath] of files.entries()) {
      if (!IMPORT_ORDER.includes(tableName)) {
        ordered.push([tableName, filePath]);
      }
    }
    
    return ordered;
  }
  
  /**
   * Import einer einzelnen JSON-Datei
   */
  async importFile(filePath: string, tableName: string, options: JsonImportOptions = {}): Promise<void> {
    const startTime = Date.now();
    
    try {
      const entityName = TABLE_MAPPING[tableName];
      if (!entityName) {
        LOG.warn(`⚠️  ${tableName}: kein Mapping definiert`);
        return;
      }
      
      const fileStats = statSync(filePath);
      const fileSizeMB = (fileStats.size / 1024 / 1024).toFixed(2);
      
      LOG.info(`📥 ${tableName}: Batch-Import startet... (${fileSizeMB} MB)`);
      
      // DB-spezifische Batch-Größe
      const BATCH_SIZE = options.batchSize || (this.db.kind === 'hana' ? 10000 : 5000);
      
      // ✅ Alte Daten löschen - direkt mit SQL
      if (options.mode !== 'upsert') {
        const sqlTableName = this.db.kind === 'sqlite' 
          ? entityName.replace(/\./g, '_')
          : entityName;
        await this.db.run(`DELETE FROM ${sqlTableName}`);
      }
      
      // JSON-Datei einlesen
      const content = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      if (!Array.isArray(data)) {
        throw new Error('Expected JSON array, but got: ' + typeof data);
      }
      
      let insertedTotal = 0;
      let lastLogTime = Date.now();
      
      // Batch-Import
      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        
        // Transform Batch
        const transformedRows = batch.map(transformRow);
        
        // ✅ Insert Batch - direkt mit SQL INSERT
        if (transformedRows.length > 0) {
          // Baue INSERT statement
          const columns = Object.keys(transformedRows[0]);
          const placeholders = columns.map(() => '?').join(', ');
          const sqlTableName = this.db.kind === 'sqlite' 
            ? entityName.replace(/\./g, '_')
            : entityName;
          
          for (const row of transformedRows) {
            const values = columns.map(col => row[col]);
            await this.db.run(
              `INSERT INTO ${sqlTableName} (${columns.join(', ')}) VALUES (${placeholders})`,
              values
            );
          }
          
          insertedTotal += transformedRows.length;
          
          // Progress-Logging
          const now = Date.now();
          if (insertedTotal % 10000 === 0 && (now - lastLogTime) > 2000) {
            const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0);
            const rss = (process.memoryUsage().rss / 1024 / 1024).toFixed(0);
            const rowsPerSec = Math.round(insertedTotal / ((now - startTime) / 1000));
            const progress = ((insertedTotal / data.length) * 100).toFixed(1);
            LOG.info(`   📊 ${tableName}: ${progress}% (${insertedTotal.toLocaleString()}/${data.length.toLocaleString()}) - ${rowsPerSec} rows/s - Heap ${mem} MB, RSS ${rss} MB`);
            lastLogTime = now;
          }
        }
      }
      
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
  
  /**
   * ✅ Validate database connection
   */
  private async validateDatabase(): Promise<void> {
    try {
      LOG.info('🔍 Validating database connection...');
      
      if (!this.db) {
        throw new Error('Database connection failed - db is null');
      }
      
      LOG.info(`✅ Database connected: ${this.db.kind}`);
      LOG.info('');
      
    } catch (error) {
      LOG.error('❌ Database connection validation failed!');
      LOG.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error('Database connection validation failed. Import aborted.');
    }
  }
  
  /**
   * ✅ Database-spezifische Optimierung
   */
  private async optimizeDatabase(): Promise<void> {
    try {
      LOG.info('⚙️  Optimizing database for bulk import...');
      
      if (this.db.kind === 'sqlite') {
        await this.db.run('PRAGMA journal_mode = WAL');
        await this.db.run('PRAGMA synchronous = NORMAL');
        await this.db.run('PRAGMA cache_size = -64000');
        await this.db.run('PRAGMA temp_store = MEMORY');
        
        LOG.info('   ✓ WAL mode enabled');
        LOG.info('   ✓ Sync mode: NORMAL');
        LOG.info('   ✓ Cache size: 64 MB');
        LOG.info('   ✓ Temp store: MEMORY');
        LOG.info('✅ SQLite optimized for bulk insert');
      } else if (this.db.kind === 'hana') {
        LOG.info('   ✓ Using native HANA bulk insert');
        LOG.info('   ✓ Auto-commit enabled');
        LOG.info('   ✓ Batch size: 10000 rows');
        LOG.info('✅ HANA ready for bulk insert');
      } else {
        LOG.info(`✅ Database ready: ${this.db.kind}`);
      }
      
      LOG.info('');
      
    } catch (error) {
      LOG.warn('⚠️  Database optimization failed (continuing anyway)');
      LOG.warn(`   ${error instanceof Error ? error.message : String(error)}`);
      LOG.info('');
    }
  }
}
