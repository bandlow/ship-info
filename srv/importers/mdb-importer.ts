// srv/importers/mdb-importer.ts
import MDBReader from 'mdb-reader';
import { readFileSync } from 'fs';
import cds from '@sap/cds';
import { TABLE_MAPPING, IMPORT_ORDER, transformRow } from './table-mapper.js';
import type { ImportResult, ImportStats } from '../types/index.js';

const { DELETE, INSERT } = cds.ql;
const LOG = cds.log('mdb-importer');

export class MDBImporter {
  private reader: MDBReader | null = null;
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
  
  openMDB(filePath: string): string[] {
    const buffer = readFileSync(filePath);
    this.reader = new MDBReader(buffer);
    
    const tables = this.reader.getTableNames();
    LOG.info(`📂 MDB geöffnet: ${tables.length} Tabellen gefunden`);
    this.logMemory('Nach MDB-Load');
    return tables;
  }
  
  async importAll(filePath: string): Promise<ImportResult> {
    const startTime = Date.now();
    this.stats = {};
    
    try {
      LOG.info('🚀 Starting MDB import from:', filePath);
      this.logMemory('Start');
      
      this.openMDB(filePath);
      
      if (!this.reader) {
        throw new Error('MDB konnte nicht geöffnet werden');
      }
      
      // ✅ SQLite Performance-Tuning (ohne Transaction)
      await this.optimizeSQLite();
      
      // Importiere alle Tabellen
      for (const tableName of IMPORT_ORDER) {
        if (!this.reader.getTableNames().includes(tableName)) {
          LOG.warn(`⚠️  ${tableName} nicht in MDB gefunden - überspringe`);
          continue;
        }
        
        await this.importTable(tableName);
        
        // ✅ Garbage Collection nach jeder Tabelle
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
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      LOG.error('❌ Import fehlgeschlagen:', errorMessage);
      throw error;
    }
  }
  
  /**
   * ✅ SQLite Performance optimieren (ohne Transaction - CDS managed das)
   */
  private async optimizeSQLite(): Promise<void> {
    try {
      const db = await cds.connect.to('db');
      
      // WAL-Modus für bessere Performance
      await db.run('PRAGMA journal_mode = WAL');
      
      // Weniger Disk-Syncs
      await db.run('PRAGMA synchronous = NORMAL');
      
      // Größerer Cache
      await db.run('PRAGMA cache_size = 10000');
      
      // Temp-Daten im RAM
      await db.run('PRAGMA temp_store = MEMORY');
      
      LOG.info('✅ SQLite optimiert (WAL, Cache, Temp-Memory)');
    } catch (error) {
      LOG.warn('⚠️  SQLite-Optimierung fehlgeschlagen (nicht kritisch)');
    }
  }
  
  async importTable(tableName: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      if (!this.reader) {
        throw new Error('MDB Reader nicht initialisiert');
      }
      
      // Daten aus MDB lesen
      const mdbTable = this.reader.getTable(tableName);
      const rows = mdbTable.getData();
      
      if (rows.length === 0) {
        LOG.info(`⏭️  ${tableName}: keine Daten`);
        return;
      }
      
      // CDS Entity ermitteln
      const entityName = TABLE_MAPPING[tableName];
      if (!entityName) {
        LOG.warn(`⚠️  ${tableName}: kein Mapping definiert`);
        return;
      }
      
      LOG.info(`🗑️  ${tableName}: Lösche alte Daten...`);
      
      // ✅ Kein BEGIN/COMMIT - CDS managed Transactions automatisch
      await DELETE.from(entityName);
      
      // ✅ Chunk-basierte Verarbeitung
      const BATCH_SIZE = 1000;        // SQLite kann größere Batches
      const TRANSFORM_CHUNK = 10000;   // Transformiere max 10k auf einmal
      let inserted = 0;
      let lastLogTime = Date.now();
      
      for (let i = 0; i < rows.length; i += TRANSFORM_CHUNK) {
        // Transformiere nur einen Chunk (reduziert Memory)
        const chunkEnd = Math.min(i + TRANSFORM_CHUNK, rows.length);
        const chunk = rows.slice(i, chunkEnd);
        const transformedChunk = chunk.map(transformRow);
        
        // Insert in Batches
        for (let j = 0; j < transformedChunk.length; j += BATCH_SIZE) {
          const batch = transformedChunk.slice(j, j + BATCH_SIZE);
          await INSERT.into(entityName).entries(batch);
          inserted += batch.length;
          
          // Progress-Log (max alle 2 Sekunden)
          const now = Date.now();
          if (rows.length > 1000 && inserted % 5000 === 0 && (now - lastLogTime) > 2000) {
            const progress = (inserted / rows.length * 100).toFixed(0);
            const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0);
            const rowsPerSec = Math.round(inserted / ((now - startTime) / 1000));
            LOG.info(`   📊 ${tableName}: ${progress}% (${inserted.toLocaleString()} / ${rows.length.toLocaleString()}) - ${rowsPerSec} rows/s - ${mem} MB`);
            lastLogTime = now;
          }
        }
        
        // Chunk ist fertig - wird vom GC aufgeräumt
      }
      
      const duration = Date.now() - startTime;
      this.stats[tableName] = { tableName, rows: inserted, duration };
      
      const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0);
      const avgSpeed = Math.round(inserted / (duration / 1000));
      LOG.info(`✅ ${tableName}: ${inserted.toLocaleString()} Zeilen in ${(duration / 1000).toFixed(1)}s (${avgSpeed} rows/s) - ${mem} MB`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      LOG.error(`❌ ${tableName}:`, errorMessage);
      this.stats[tableName] = { tableName, rows: 0, duration: 0, error: errorMessage };
    }
  }
}
