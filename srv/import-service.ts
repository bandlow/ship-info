// srv/import-service.ts
import cds from '@sap/cds';
import { MDBImporter } from './importers/mdb-importer.js';
import { JSONImporter } from './importers/json-importer.js';
import type { ImportStats } from './types/index.js';

interface ImportRequest {
  data: {
    filePath: string;
  };
}

class ImportServiceImpl extends cds.ApplicationService {
  async init() {
    
    this.on('importFromMDB', async (req: ImportRequest) => {
      const { filePath } = req.data;
      
      console.log(`🚀 Starting MDB import from: ${filePath}`);
      
      try {
        const importer = new MDBImporter();
        const result = await importer.importAll(filePath);
        
        const importedTables = result.stats 
          ? Object.values(result.stats).map((stat: ImportStats) => ({
              tableName: stat.tableName,
              rowCount: stat.rows,
              duration: stat.duration
            }))
          : [];
        
        return {
          success: true,
          message: `${importedTables.length} Tabellen importiert`,
          importedTables
        };
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
        console.error('Import failed:', errorMessage);
        
        return {
          success: false,
          message: errorMessage,
          importedTables: []
        };
      }
    });
    
    this.on('importDeltaJSON', async (req: ImportRequest) => {
      const { filePath } = req.data;
      
      console.log(`🔄 Starting JSON delta import from: ${filePath}`);
      
      try {
        const importer = new JSONImporter();
        const result = await importer.importDelta(filePath);
        
        return result;
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
        console.error('Delta import failed:', errorMessage);
        
        return {
          success: false,
          message: errorMessage,
          updated: 0,
          inserted: 0,
          errors: 1
        };
      }
    });
    
    await super.init();
  }
}

export default ImportServiceImpl;
