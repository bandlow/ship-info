// srv/importers/json-importer.ts
import { readFileSync } from 'fs';
import cds from '@sap/cds';
import { TABLE_MAPPING, transformRow, getBusinessKey } from './table-mapper.js';
import type { DeltaImportResult, MDBRow } from '../types/index.js';

const { SELECT, INSERT, UPDATE } = cds.ql;
const LOG = cds.log('json-importer');

export class JSONImporter {
  
  async importDelta(filePath: string): Promise<DeltaImportResult> {
    const startTime = Date.now();
    let updated = 0;
    let inserted = 0;
    let errors = 0;
    
    try {
      LOG.info('🔄 Starting JSON delta import from:', filePath);
      
      const fileContent = readFileSync(filePath, 'utf8');
      const jsonData: Record<string, MDBRow[]> = JSON.parse(fileContent);
      
      for (const [tableName, rows] of Object.entries(jsonData)) {
        const entityName = TABLE_MAPPING[tableName];
        
        if (!entityName) {
          LOG.warn(`⚠️  ${tableName}: kein Mapping`);
          continue;
        }
        
        LOG.info(`📥 ${tableName}: ${rows.length} Änderungen`);
        
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
            LOG.error(`❌ Fehler bei Zeile:`, errorMessage);
            errors++;
          }
        }
      }
      
      const duration = Date.now() - startTime;
      const message = `${updated} updated, ${inserted} inserted, ${errors} errors`;
      LOG.info(`✅ Delta-Import: ${message} in ${duration}ms`);
      
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
      LOG.error('❌ Delta-Import fehlgeschlagen:', errorMessage);
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
      await UPDATE.entity(entityName).set(transformed).where(businessKey);
      return { updated: true };
    } else {
      await INSERT.into(entityName).entries(transformed);
      return { updated: false };
    }
  }
}
