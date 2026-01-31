import { readFileSync } from 'fs';
import cds from '@sap/cds';
import { TABLE_MAPPING, transformRow, getBusinessKey } from './table-mapper.js';
import type { DeltaImportResult, MDBRow, TransformedRow, JobLogEntry } from '../types/index.js';

const { SELECT, INSERT, UPDATE } = cds.ql;

export class JSONImporter {
  
  async importDelta(filePath: string): Promise<DeltaImportResult> {
    const startTime = Date.now();
    let updated = 0;
    let inserted = 0;
    let errors = 0;
    
    try {
      const fileContent = readFileSync(filePath, 'utf8');
      const jsonData: Record<string, MDBRow[]> = JSON.parse(fileContent);
      
      const jobID = await this.createJobLog('JSON_DELTA_IMPORT');
      
      for (const [tableName, rows] of Object.entries(jsonData)) {
        const entityName = TABLE_MAPPING[tableName];
        
        if (!entityName) {
          console.log(`⚠️  ${tableName}: kein Mapping`);
          continue;
        }
        
        console.log(`📥 ${tableName}: ${rows.length} Änderungen`);
        
        for (const row of rows) {
          try {
            const result = await this.upsertRow(entityName, tableName, row);
            if (result.updated) {
              updated++;
            } else {
              inserted++;
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
            console.error(`❌ Fehler bei Zeile:`, row, errorMessage);
            errors++;
          }
        }
      }
      
      const message = `${updated} updated, ${inserted} inserted, ${errors} errors`;
      await this.updateJobLog(jobID, errors === 0, message);
      
      const duration = Date.now() - startTime;
      console.log(`✅ Delta-Import: ${duration}ms`);
      
      return { 
        success: errors === 0, 
        updated, 
        inserted, 
        errors, 
        duration,
        message 
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      console.error('❌ Delta-Import fehlgeschlagen:', errorMessage);
      throw error;
    }
  }
  
  private async upsertRow(
    entityName: string, 
    tableName: string, 
    row: MDBRow
  ): Promise<{ updated: boolean }> {
    const transformed = transformRow(row);
    const businessKey = getBusinessKey(tableName, transformed);
    
    if (!businessKey) {
      await INSERT.into(entityName).entries(transformed);
      return { updated: false };
    }
    
    const existing = await SELECT.one.from(entityName).where(businessKey);
    
    if (existing) {
      // ✅ Korrigiert: UPDATE mit .entity()
      await UPDATE.entity(entityName).set(transformed).where(businessKey);
      return { updated: true };
    } else {
      await INSERT.into(entityName).entries(transformed);
      return { updated: false };
    }
  }
  
  private async createJobLog(jobType: string): Promise<string> {
    const { jobLog } = cds.entities('shipinfo');
    
    const result = await INSERT.into(jobLog).entries({
      JobType: jobType,
      StartTime: new Date(),
      Status: 'RUNNING'
    });
    
    return result.ID as string;
  }
  
  private async updateJobLog(jobID: string, success: boolean, message: string): Promise<void> {
    const { jobLog } = cds.entities('shipinfo');
    
    // ✅ Korrigiert: UPDATE mit .entity()
    await UPDATE.entity(jobLog).set({
      EndTime: new Date(),
      Success: success,
      Status: success ? 'COMPLETED' : 'FAILED',
      Message: message
    }).where({ ID: jobID });
  }
}
