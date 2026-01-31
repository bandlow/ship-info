// srv/importers/mdb-stream-importer.ts
import { parse } from 'csv-parse';
import { Readable } from 'stream';
import cds from '@sap/cds';
import { streamTable, listTables, checkMDBTools } from '../utils/mdb-export-stream.js';
import { TABLE_MAPPING, IMPORT_ORDER, transformRow } from './table-mapper.js';
import type { ImportResult, ImportStats } from '../types/index.js';

const { DELETE, INSERT } = cds.ql;
const LOG = cds.log('mdb-stream-importer');

export class MDBStreamImporter {
  private stats: Record<string, ImportStats> = {};
  
  private logMemory(context: string): void {
    const mem = process.memoryUsage();
    const heapUsed = (mem.heapUsed / 1024 / 1024).toFixed(0);
    const rss = (mem.rss / 1024 / 1024).toFixed(0);
    LOG.info(`💾 ${context}: Heap ${heapUsed} MB, RSS ${rss} MB`);
  }
  
  async importAll(mdbPath: string): Promise<ImportResult> {
    const startTime = Date.now();
    this.stats = {};
    
    LOG.info('🚀 Starting MDB stream import from:', mdbPath);
    this.logMemory('Start');
    
    // Prüfe mdb-tools
    const hasTools = await checkMDBTools();
    if (!hasTools) {
      throw new Error('mdb-tools nicht installiert! Install: apt-get install mdbtools');
    }
    
    LOG.info('✅ mdb-tools verfügbar');
    
    // SQLite optimieren
    await this.optimizeSQLite();
    
    // Liste verfügbare Tabellen
    const availableTables = await listTables(mdbPath);
    LOG.info(`📂 MDB enthält ${availableTables.length} Tabellen`);
    
    // Importiere in korrekter Reihenfolge
    for (const tableName of IMPORT_ORDER) {
      if (!availableTables.includes(tableName)) {
        LOG.warn(`⚠️  ${tableName} nicht in MDB - überspringe`);
        continue;
      }
      
      await this.importTable(mdbPath, tableName);
      
      // Garbage Collection
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
  
  private async optimizeSQLite(): Promise<void> {
    try {
      const db = await cds.connect.to('db');
      await db.run('PRAGMA journal_mode = WAL');
      await db.run('PRAGMA synchronous = NORMAL');
      await db.run('PRAGMA cache_size = 10000');
      await db.run('PRAGMA temp_store = MEMORY');
      LOG.info('✅ SQLite optimiert');
    } catch (error) {
      LOG.warn('⚠️  SQLite-Optimierung fehlgeschlagen');
    }
  }
  
  async importTable(mdbPath: string, tableName: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      const entityName = TABLE_MAPPING[tableName];
      if (!entityName) {
        LOG.warn(`⚠️  ${tableName}: kein Mapping`);
        return;
      }
      
      LOG.info(`📥 ${tableName}: Stream-Import startet...`);
      
      // Alte Daten löschen
      await DELETE.from(entityName);
      
      let batch: any[] = [];
      let inserted = 0;
      let isFirstLine = true;
      const BATCH_SIZE = 1000;
      let lastLogTime = Date.now();
      
      // ✅ Nutze streamTable mit onLine callback
      await streamTable(mdbPath, tableName, {
        onLine: async (line) => {
          // Skip header
          if (isFirstLine) {
            isFirstLine = false;
            return;
          }
          
          // Parse CSV-Zeile manuell (einfach) oder mit csv-parse
          const parser = parse({
            columns: true,
            skip_empty_lines: true,
            trim: true,
            relax_quotes: true
          });
          
          // Mini-Stream für einzelne Zeile
          const readable = Readable.from([line]);
          const records: any[] = [];
          
          await new Promise<void>((resolve, reject) => {
            readable
              .pipe(parser)
              .on('data', (record) => records.push(record))
              .on('end', () => resolve())
              .on('error', reject);
          });
          
          if (records.length === 0) return;
          
          batch.push(transformRow(records[0]));
          
          // Batch-Insert
          if (batch.length >= BATCH_SIZE) {
            await INSERT.into(entityName).entries(batch);
            inserted += batch.length;
            batch = [];
            
            const now = Date.now();
            if (inserted % 5000 === 0 && (now - lastLogTime) > 2000) {
              const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0);
              const rss = (process.memoryUsage().rss / 1024 / 1024).toFixed(0);
              const rowsPerSec = Math.round(inserted / ((now - startTime) / 1000));
              LOG.info(`   📊 ${tableName}: ${inserted.toLocaleString()} rows - ${rowsPerSec} rows/s - Heap ${mem} MB, RSS ${rss} MB`);
              lastLogTime = now;
            }
          }
        }
      });
      
      // Rest einfügen
      if (batch.length > 0) {
        await INSERT.into(entityName).entries(batch);
        inserted += batch.length;
      }
      
      const duration = Date.now() - startTime;
      this.stats[tableName] = { tableName, rows: inserted, duration };
      
      const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0);
      const rss = (process.memoryUsage().rss / 1024 / 1024).toFixed(0);
      const avgSpeed = Math.round(inserted / (duration / 1000));
      LOG.info(`✅ ${tableName}: ${inserted.toLocaleString()} rows in ${(duration / 1000).toFixed(1)}s (${avgSpeed} rows/s) - Heap ${mem} MB, RSS ${rss} MB`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      LOG.error(`❌ ${tableName}:`, errorMessage);
      this.stats[tableName] = { tableName, rows: 0, duration: 0, error: errorMessage };
    }
  }
}
