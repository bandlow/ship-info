// test/smart-import.test.ts
import { ImportManager } from '../srv/importers/import-manager.js';
import type { SftpConfig } from '../srv/services/sftp-downloader.js';

async function testSmartImport() {
  const manager = new ImportManager();
  
  // Option 1: Aus lokalem Verzeichnis
  await manager.smartImport('./downloads');
  
  // Option 2: Mit SFTP-Download
  const sftpConfig: SftpConfig = {
    host: process.env.SFTP_HOST!,
    port: parseInt(process.env.SFTP_PORT || '22'),
    username: process.env.SFTP_USER!,
    password: process.env.SFTP_PASSWORD!,
    remotePath: '/'
  };
  
  await manager.smartImport(undefined, {
    sftpConfig,
    downloadDir: '/downloads',
    downloadLatest: true,
    cleanup: true  // Cleanup nach Import
  });
}

testSmartImport();
