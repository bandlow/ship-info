// srv/importers/mdb-stream-importer-v2.ts
import { PassThrough } from 'node:stream';
import { parse } from 'csv-parse';
import cds from '@sap/cds';
import { streamTable, listTables, checkMDBTools } from '../utils/mdb-export-stream.js';
import { TABLE_MAPPING, IMPORT_ORDER, transformRow } from './table-mapper.js';
import type { ImportResult, ImportStats } from '../types/index.js';

const { DELETE, INSERT } = cds.ql;
const LOG = cds.log('mdb-stream-importer');

export class MDBStreamImporter {
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
    
    LOG.info('🚀 Starting MDB stream import from:', mdbPath);
    this.logMemory('Start');
    
    // Prüfe ob mdb-tools verfügbar ist
    const hasTools = await checkMDBTools();
    if (!hasTools) {
      throw new Error('mdb-tools nicht installiert! Install: apt-get install mdbtools');
    }
    
    LOG.info('✅ mdb-tools verfügbar');
    
    // SQLite Performance optimieren
    await this.optimizeSQLite();
    
    // Liste verfügbare Tabellen
    const availableTables = await listTables(mdbPath);
    LOG.info(`📂 MDB enthält ${availableTables.length} Tabellen`);
    
    // Importiere in korrekter Reihenfolge (wegen Foreign Keys)
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
      
      // WAL-Modus für bessere Performance
      await db.run('PRAGMA journal_mode = WAL');
      
      // Weniger Disk-Syncs (schneller, aber weniger sicher bei Crash)
      await db.run('PRAGMA synchronous = NORMAL');
      
      // Größerer Cache (10000 pages * page_size)
      await db.run('PRAGMA cache_size = 10000');
      
      // Temp-Daten im RAM statt auf Disk
      await db.run('PRAGMA temp_store = MEMORY');
      
      LOG.info('✅ SQLite optimiert (WAL, Cache, Temp-Memory)');
    } catch (error) {
      LOG.warn('⚠️  SQLite-Optimierung fehlgeschlagen (nicht kritisch)');
    }
  }
  
  /**
   * Import einer einzelnen Tabelle via Stream
   */
  async importTable(mdbPath: string, tableName: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      const entityName = TABLE_MAPPING[tableName];
      if (!entityName) {
        LOG.warn(`⚠️  ${tableName}: kein Mapping definiert`);
        return;
      }
      
      LOG.info(`📥 ${tableName}: Stream-Import startet...`);
      
      // Alte Daten löschen
      await DELETE.from(entityName);
      
      let batch: any[] = [];
      let inserted = 0;
      const BATCH_SIZE = 1000;
      let lastLogTime = Date.now();
      
      // PassThrough-Stream für Pipe zwischen mdb-export und csv-parse
      const passThrough = new PassThrough();
      
      // CSV-Parser setup
      const parser = passThrough.pipe(parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
        relax_column_count: true,
        escape: '"',
        quote: '"'
      }));
      
      // Starte mdb-export Stream (läuft parallel)
      const streamPromise = streamTable(mdbPath, tableName, { 
        sink: passThrough 
      });
      
      // Verarbeite Zeilen aus Parser (async iteration)
      for await (const row of parser) {
        try {
          const transformedRow = transformRow(row);
          batch.push(transformedRow);
          
          // Batch-Insert wenn voll
          if (batch.length >= BATCH_SIZE) {
            await INSERT.into(entityName).entries(batch);
            inserted += batch.length;
            batch = [];
            
            // Progress-Logging
            const now = Date.now();
            if (inserted % 5000 === 0 && (now - lastLogTime) > 2000) {
              const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0);
              const rss = (process.memoryUsage().rss / 1024 / 1024).toFixed(0);
              const rowsPerSec = Math.round(inserted / ((now - startTime) / 1000));
              LOG.info(`   📊 ${tableName}: ${inserted.toLocaleString()} rows - ${rowsPerSec} rows/s - Heap ${mem} MB, RSS ${rss} MB`);
              lastLogTime = now;
            }
          }
        } catch (transformError) {
          LOG.warn(`⚠️  ${tableName}: Fehler beim Transformieren einer Zeile:`, transformError);
        }
      }
      
      // Rest-Batch einfügen
      if (batch.length > 0) {
        await INSERT.into(entityName).entries(batch);
        inserted += batch.length;
      }
      
      // Warte auf mdb-export Process completion
      await streamPromise;
      
      // Stats sammeln
      const duration = Date.now() - startTime;
      this.stats[tableName] = { tableName, rows: inserted, duration };
      
      // Success-Log
      const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0);
      const rss = (process.memoryUsage().rss / 1024 / 1024).toFixed(0);
      const avgSpeed = Math.round(inserted / (duration / 1000));
      LOG.info(`✅ ${tableName}: ${inserted.toLocaleString()} rows in ${(duration / 1000).toFixed(1)}s (${avgSpeed} rows/s) - Heap ${mem} MB, RSS ${rss} MB`);
      
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
