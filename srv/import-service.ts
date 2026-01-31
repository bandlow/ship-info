// srv/import-service.ts
import cds from '@sap/cds';
import { MDBImporter } from './importers/mdb-importer.js';
import { JSONImporter } from './importers/json-importer.js';
import type { ImportStats } from './types/index.js';

const LOG = cds.log('import-service');

interface ImportRequest {
  data: {
    filePath: string;
  };
}

export default cds.service.impl(async function(this: any) {
  
  /**
   * Import aus MDB
   */
  this.on('importFromMDB', async (req: ImportRequest) => {
    const { filePath } = req.data;
    
    LOG.info(`🚀 Starting MDB import from: ${filePath}`);
    
    try {
      const importer = new MDBImporter();
      const result = await importer.importAll(filePath);
      
      // Stats für Response formatieren
      const importedTables = result.stats 
        ? Object.values(result.stats).map((stat: ImportStats) => ({
            tableName: stat.tableName,
            rowCount: stat.rows,
            duration: stat.duration
          }))
        : [];
      
      LOG.info(`✅ Import completed: ${importedTables.length} tables`);
      
      return {
        success: true,
        message: `${importedTables.length} Tabellen importiert`,
        importedTables
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      LOG.error('❌ Import failed:', errorMessage);
      
      return {
        success: false,
        message: errorMessage,
        importedTables: []
      };
    }
  });
  
  /**
   * Delta-Import aus JSON
   */
  this.on('importDeltaJSON', async (req: ImportRequest) => {
    const { filePath } = req.data;
    
    LOG.info(`🔄 Starting JSON delta import from: ${filePath}`);
    
    try {
      const importer = new JSONImporter();
      const result = await importer.importDelta(filePath);
      
      LOG.info(`✅ Delta import completed: ${result.message}`);
      
      return result;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      LOG.error('❌ Delta import failed:', errorMessage);
      
      return {
        success: false,
        message: errorMessage,
        updated: 0,
        inserted: 0,
        errors: 1
      };
    }
  });
});
