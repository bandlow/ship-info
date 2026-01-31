// srv/importers/mdb-importer.ts
import MDBReader from 'mdb-reader';
import { readFileSync } from 'fs';
import cds from '@sap/cds';
import { TABLE_MAPPING, IMPORT_ORDER, transformRow } from './table-mapper.js';
import type { ImportResult, ImportStats, JobLogEntry } from '../types/index.js';

const { DELETE, INSERT, UPDATE, SELECT } = cds.ql;

export class MDBImporter {
  private reader: MDBReader | null = null;
  private stats: Record<string, ImportStats> = {};
  
  /**
   * Öffnet MDB-Datei
   */
  openMDB(filePath: string): string[] {
    const buffer = readFileSync(filePath);
    this.reader = new MDBReader(buffer);
    
    const tables = this.reader.getTableNames();
    console.log(`📂 MDB geöffnet: ${tables.length} Tabellen gefunden`);
    return tables;
  }
  
  /**
   * Importiert alle Tabellen in definierter Reihenfolge
   */
  async importAll(filePath: string): Promise<ImportResult> {
    const startTime = Date.now();
    this.stats = {};
    
    try {
      // 1. MDB öffnen
      this.openMDB(filePath);
      
      if (!this.reader) {
        throw new Error('MDB konnte nicht geöffnet werden');
      }
      
      // 2. Job-Log erstellen
      const jobID = await this.createJobLog('MDB_FULL_IMPORT');
      
      // 3. Tabellen in korrekter Reihenfolge importieren
      for (const tableName of IMPORT_ORDER) {
        if (!this.reader.getTableNames().includes(tableName)) {
          console.log(`⚠️  Tabelle ${tableName} nicht in MDB gefunden - überspringe`);
          continue;
        }
        
        await this.importTable(tableName);
      }
      
      // 4. Job-Log aktualisieren
      await this.updateJobLog(jobID, true, 'Import erfolgreich');
      
      const duration = Date.now() - startTime;
      console.log(`✅ Import abgeschlossen in ${(duration / 1000).toFixed(2)}s`);
      
      return {
        success: true,
        duration,
        stats: this.stats,
        message: `${Object.keys(this.stats).length} Tabellen importiert`
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      console.error('❌ Import fehlgeschlagen:', errorMessage);
      throw error;
    }
  }
  
  /**
   * Importiert einzelne Tabelle
   */
  async importTable(tableName: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      if (!this.reader) {
        throw new Error('MDB Reader nicht initialisiert');
      }
      
      // 1. Daten aus MDB lesen
      const mdbTable = this.reader.getTable(tableName);
      const rows = mdbTable.getData();
      
      if (rows.length === 0) {
        console.log(`⏭️  ${tableName}: keine Daten`);
        return;
      }
      
      // 2. CDS Entity ermitteln
      const entityName = TABLE_MAPPING[tableName];
      if (!entityName) {
        console.log(`⚠️  ${tableName}: kein Mapping definiert`);
        return;
      }
      
      // 3. Alte Daten löschen
      await DELETE.from(entityName);
      
      // 4. Daten transformieren und einfügen
      const transformedRows = rows.map(transformRow);
      
      // Batch-Insert in Chunks (HANA Limit: ~1000 rows)
      const BATCH_SIZE = 500;
      let inserted = 0;
      
      for (let i = 0; i < transformedRows.length; i += BATCH_SIZE) {
        const batch = transformedRows.slice(i, i + BATCH_SIZE);
        await INSERT.into(entityName).entries(batch);
        inserted += batch.length;
      }
      
      const duration = Date.now() - startTime;
      this.stats[tableName] = { tableName, rows: inserted, duration };
      
      console.log(`✅ ${tableName}: ${inserted} Zeilen in ${duration}ms`);
      
      // 5. Update-Status speichern
      await this.updateEntityStatus(tableName, rows.length);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      console.error(`❌ ${tableName}: Fehler beim Import`, errorMessage);
      this.stats[tableName] = { tableName, rows: 0, duration: 0, error: errorMessage };
      throw error;
    }
  }
  
  /**
   * Erstellt Job-Log-Eintrag
   */
  private async createJobLog(jobType: string): Promise<string> {
    const { jobLog } = cds.entities('skf.zcapn.shipimporter');
    
    const entry: JobLogEntry = {
      JobType: jobType,
      StartTime: new Date(),
      Status: 'RUNNING'
    };
    
    const result = await INSERT.into(jobLog).entries(entry);
    return result.ID as string;
  }
  
  /**
   * Aktualisiert Job-Log
   */
  private async updateJobLog(jobID: string, success: boolean, message: string): Promise<void> {
    const { jobLog } = cds.entities('skf.zcapn.shipimporter');
    
    await UPDATE.entity(jobLog).set({
      EndTime: new Date(),
      Success: success,
      Status: success ? 'COMPLETED' : 'FAILED',
      Message: message
    }).where({ ID: jobID });
  }
  
  /**
   * Speichert Entity-Update-Status
   */
  private async updateEntityStatus(tableName: string, rowCount: number): Promise<void> {
    const { entityUpdateStatus } = cds.entities('skf.zcapn.shipimporter');
    
    await INSERT.into(entityUpdateStatus).entries({
      Entity: tableName,
      Key: 'FULL_IMPORT',
      LastDeltaUpdateDate: new Date()
    });
  }
}
