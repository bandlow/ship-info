// test/test-sftp-list.ts
import { SftpDownloader } from '../srv/services/sftp-downloader.js';
import cds from '@sap/cds';

const LOG = cds.log('sftp-list');

async function testListFiles() {
  try {
    const sftpConfig = {
      host: process.env.SFTP_HOST!,
      port: parseInt(process.env.SFTP_PORT || '22'),
      username: process.env.SFTP_USER!,
      password: process.env.SFTP_PASSWORD,
      remotePath: '' // not used for listing
    };
    
    const downloader = new SftpDownloader(sftpConfig);
    const files = await downloader.listFiles('/');
    
    LOG.info('📋 Files on SFTP server:');
    files.forEach(file => {
      const type = file.type === 'd' ? '📁' : '📄';
      LOG.info(`   ${type} ${file.name} (${file.size} bytes)`);
    });
    
  } catch (error) {
    LOG.error('❌ Failed:', error);
  }
}

testListFiles();
