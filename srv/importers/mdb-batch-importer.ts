// srv/importers/mdb-batch-importer.ts
import cds from '@sap/cds';
import { readTableInBatches, listTables } from '../utils/mdb-batch-reader.js';
import { TABLE_MAPPING, IMPORT_ORDER, transformRow } from './table-mapper.js';
import type { ImportResult, ImportStats } from '../types/index.js';

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
    
    // SQLite Performance optimieren
    await this.optimizeSQLite();
    
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
   * SQLite Performance optimieren
   */
  private async optimizeSQLite(): Promise<void> {
    try {
      const db = await cds.connect.to('db');
      await db.run('PRAGMA journal_mode = WAL');
      await db.run('PRAGMA synchronous = NORMAL');
      await db.run('PRAGMA cache_size = 10000');
      await db.run('PRAGMA temp_store = MEMORY');
      LOG.info('✅ SQLite optimiert (WAL, Cache, Temp-Memory)');
    } catch (error) {
      LOG.warn('⚠️  SQLite-Optimierung fehlgeschlagen (nicht kritisch)');
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
      
      // Alte Daten löschen
      await DELETE.from(entityName);
      
      let insertedTotal = 0;
      let lastLogTime = Date.now();
      const BATCH_SIZE = 5000;
      
      // ✅ Batch-Import mit mdb-reader Pagination
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
