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
  
  openMDB(filePath: string): string[] {
    const buffer = readFileSync(filePath);
    this.reader = new MDBReader(buffer);
    
    const tables = this.reader.getTableNames();
    LOG.info(`📂 MDB geöffnet: ${tables.length} Tabellen gefunden`);
    return tables;
  }
  
  async importAll(filePath: string): Promise<ImportResult> {
    const startTime = Date.now();
    this.stats = {};
    
    try {
      LOG.info('🚀 Starting MDB import from:', filePath);
      
      this.openMDB(filePath);
      
      if (!this.reader) {
        throw new Error('MDB konnte nicht geöffnet werden');
      }
      
      // Importiere alle Tabellen
      for (const tableName of IMPORT_ORDER) {
        if (!this.reader.getTableNames().includes(tableName)) {
          LOG.warn(`⚠️  ${tableName} nicht in MDB gefunden - überspringe`);
          continue;
        }
        
        await this.importTable(tableName);
      }
      
      const duration = Date.now() - startTime;
      LOG.info(`✅ Import abgeschlossen in ${(duration / 1000).toFixed(2)}s`);
      
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
      
      // Alte Daten löschen
      LOG.info(`🗑️  ${tableName}: Lösche alte Daten...`);
      await DELETE.from(entityName);
      
      // Daten transformieren und einfügen
      const transformedRows = rows.map(transformRow);
      
      // Batch-Insert
      const BATCH_SIZE = 500;
      let inserted = 0;
      
      for (let i = 0; i < transformedRows.length; i += BATCH_SIZE) {
        const batch = transformedRows.slice(i, i + BATCH_SIZE);
        await INSERT.into(entityName).entries(batch);
        inserted += batch.length;
        
        // Progress für große Tabellen
        if (transformedRows.length > 1000 && (i + BATCH_SIZE) % 5000 === 0) {
          const progress = ((i + BATCH_SIZE) / transformedRows.length * 100).toFixed(0);
          LOG.info(`   📊 ${tableName}: ${progress}% (${i + BATCH_SIZE} / ${transformedRows.length})`);
        }
      }
      
      const duration = Date.now() - startTime;
      this.stats[tableName] = { tableName, rows: inserted, duration };
      
      LOG.info(`✅ ${tableName}: ${inserted.toLocaleString()} Zeilen in ${(duration / 1000).toFixed(1)}s`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      LOG.error(`❌ ${tableName}:`, errorMessage);
      this.stats[tableName] = { tableName, rows: 0, duration: 0, error: errorMessage };
      // Nicht werfen - nächste Tabelle versuchen
    }
  }
}
