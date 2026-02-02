// srv/services/ship-import-service.ts
import cds from '@sap/cds';
import { SftpDownloader } from './sftp-downloader.js';
import { getSftpDestination } from '../utils/destination-helper.js';

const LOG = cds.log('ship-import');

export class ShipImportService extends cds.ApplicationService {
  async init() {
    
    this.on('importFullData', async (req) => {
      try {
        LOG.info('🚢 Starting full data import...');
        
        // ✅ Read SFTP credentials from BTP Destination
        const sftpConfig = await getSftpDestination('SFTP_SHIPDATA');
        
        // ✅ Initialize downloader with destination credentials
        const downloader = new SftpDownloader(sftpConfig);
        
        // ✅ Download latest full import
        const localDir = '/downloads/import/full';
        const result = await downloader.downloadFullImport(localDir);
        
        LOG.info(`✅ Downloaded: ${result.format} - ${result.primaryFile}`);
        
        // Process data...
        
        return {
          success: true,
          type: result.type,
          format: result.format,
          date: result.date,
          files: result.files.length
        };
        
      } catch (error: any) {
        LOG.error('❌ Import failed:', error);
        throw error;
      }
    });
    
    this.on('importDeltaUpdate', async (req) => {
      try {
        LOG.info('🔄 Starting delta update import...');
        
        const sftpConfig = await getSftpDestination('SFTP_SHIPDATA');
        const downloader = new SftpDownloader(sftpConfig);
        
        const localDir = './data/import/delta';
        const result = await downloader.downloadDeltaUpdate(localDir);
        
        LOG.info(`✅ Downloaded: ${result.format} - ${result.files.length} file(s)`);
        
        return {
          success: true,
          type: result.type,
          format: result.format,
          date: result.date,
          files: result.files.length
        };
        
      } catch (error: any) {
        LOG.error('❌ Delta import failed:', error);
        throw error;
      }
    });
    
    await super.init();
  }
}
