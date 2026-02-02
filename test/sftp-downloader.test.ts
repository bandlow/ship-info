// test/sftp-downloader.test.ts
import { SftpDownloader } from '../srv/services/sftp-downloader.js';
import { getSftpDestination } from '../srv/utils/destination-helper.js';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import cds from '@sap/cds';
import dotenv from 'dotenv';

// ✅ ES Module __dirname replacement
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const LOG = cds.log('sftp-test');

/**
 * ✅ Test Suite für SFTP Downloader mit SSH_ASKPASS
 */
class SftpDownloaderTest {
  private testDir: string;
  
  constructor() {
    this.testDir = join(process.cwd(), '/downloads');
  }
  
  /**
   * Setup: Create test directory
   */
  async setup(): Promise<void> {
    LOG.info('\n🔧 Setup: Creating test directory...');
    
    if (existsSync(this.testDir)) {
      rmSync(this.testDir, { recursive: true, force: true });
    }
    
    mkdirSync(this.testDir, { recursive: true });
    LOG.info(`✅ Test directory: ${this.testDir}`);
  }
  
  /**
   * Cleanup: Remove test directory
   */
  async cleanup(): Promise<void> {
    LOG.info('\n🧹 Cleanup: Removing test directory...');
    
    if (existsSync(this.testDir)) {
      //rmSync(this.testDir, { recursive: true, force: true });
      LOG.info('✅ Test directory removed');
    }
  }
  
  /**
   * Test 1: Connection Test (List Files)
   */
  async testConnection(config: any): Promise<boolean> {
    LOG.info('\n📋 Test 1: Connection & List Files');
    LOG.info('─'.repeat(60));
    
    try {
      const downloader = new SftpDownloader(config);
      
      LOG.info(`   Host: ${config.host}:${config.port}`);
      LOG.info(`   User: ${config.username}`);
      
      const files = await downloader.listFiles('/');
      
      LOG.info(`✅ Connection successful`);
      LOG.info(`   Found ${files.length} file(s) in root directory`);
      
      // Show first 10 files
      files.slice(0, 10).forEach(f => {
        const size = (f.size / 1024 / 1024).toFixed(2);
        LOG.info(`   - ${f.name} (${size} MB)`);
      });
      
      if (files.length > 10) {
        LOG.info(`   ... and ${files.length - 10} more`);
      }
      
      return true;
      
    } catch (error: any) {
      LOG.error(`❌ Connection failed: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Test 2: Find Full Imports
   */
  async testFindFullImports(config: any): Promise<boolean> {
    LOG.info('📦 Test 2: Find Full Import Files');
    LOG.info('─'.repeat(60));
    
    try {
      const downloader = new SftpDownloader(config);
      
      const files = await downloader.listFiles('/');
      const fullImports = files
        .filter(f => f.name.match(/^ShipData_\d{8}\.zip$/))
        .sort((a, b) => b.name.localeCompare(a.name));
      
      if (fullImports.length === 0) {
        LOG.warn('⚠️  No full import files found');
        return false;
      }
      
      LOG.info(`✅ Found ${fullImports.length} full import file(s)`);
      
      fullImports.forEach((f, i) => {
        const size = (f.size / 1024 / 1024).toFixed(2);
        const date = f.name.match(/\d{8}/)?.[0];
        LOG.info(`   ${i + 1}. ${f.name} (${size} MB) - Date: ${date}`);
      });
      
      return true;
      
    } catch (error: any) {
      LOG.error(`❌ Test failed: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Test 3: Find Delta Updates
   */
  async testFindDeltaUpdates(config: any): Promise<boolean> {
    LOG.info('🔄 Test 3: Find Delta Update Files');
    LOG.info('─'.repeat(60));
    
    try {
      const downloader = new SftpDownloader(config);
      
      const files = await downloader.listFiles('/json');
      const deltaUpdates = files
        .filter(f => f.name.match(/^ShipData_\d{8}_Update\.zip$/))
        .sort((a, b) => b.name.localeCompare(a.name));
      
      if (deltaUpdates.length === 0) {
        LOG.warn('⚠️  No delta update files found');
        return false;
      }
      
      LOG.info(`✅ Found ${deltaUpdates.length} delta update file(s)`);
      
      deltaUpdates.slice(0, 5).forEach((f, i) => {
        const size = (f.size / 1024 / 1024).toFixed(2);
        const date = f.name.match(/\d{8}/)?.[0];
        LOG.info(`   ${i + 1}. ${f.name} (${size} MB) - Date: ${date}`);
      });
      
      if (deltaUpdates.length > 5) {
        LOG.info(`   ... and ${deltaUpdates.length - 5} more`);
      }
      
      return true;
      
    } catch (error: any) {
      LOG.error(`❌ Test failed: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Test 4: Download Full Import (with SSH_ASKPASS)
   */
  async testDownloadFullImport(config: any, date?: string): Promise<boolean> {
    LOG.info('⬇️  Test 4: Download Full Import');
    LOG.info('─'.repeat(60));
    
    try {
      const downloader = new SftpDownloader(config);
      const localDir = join(this.testDir, 'full-import');
      
      if (date) {
        LOG.info(`   Downloading specific date: ${date}`);
      } else {
        LOG.info('   Downloading latest full import...');
      }
      
      const result = await downloader.downloadFullImport(localDir, date);
      
      LOG.info(`✅ Download successful`);
      LOG.info(`   Type: ${result.type}`);
      LOG.info(`   Format: ${result.format}`);
      LOG.info(`   Date: ${result.date}`);
      LOG.info(`   Files: ${result.files.length}`);
      LOG.info(`   Primary: ${result.primaryFile}`);
      
      // Verify extracted files
      result.files.forEach(f => {
        LOG.info(`   ✓ ${f}`);
      });
      
      return true;
      
    } catch (error: any) {
      LOG.error(`❌ Download failed: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Test 5: Download Delta Update
   */
  async testDownloadDeltaUpdate(config: any, date?: string): Promise<boolean> {
    LOG.info('⬇️  Test 5: Download Delta Update');
    LOG.info('─'.repeat(60));
    
    try {
      const downloader = new SftpDownloader(config);
      const localDir = join(this.testDir, 'delta-update');
      
      if (date) {
        LOG.info(`   Downloading specific date: ${date}`);
      } else {
        LOG.info('   Downloading latest delta update...');
      }
      
      const result = await downloader.downloadDeltaUpdate(localDir, date);
      
      LOG.info(`✅ Download successful`);
      LOG.info(`   Type: ${result.type}`);
      LOG.info(`   Format: ${result.format}`);
      LOG.info(`   Date: ${result.date}`);
      LOG.info(`   Files: ${result.files.length}`);
      
      result.files.slice(0, 5).forEach(f => {
        LOG.info(`   ✓ ${f}`);
      });
      
      if (result.files.length > 5) {
        LOG.info(`   ... and ${result.files.length - 5} more`);
      }
      
      return true;
      
    } catch (error: any) {
      LOG.error(`❌ Download failed: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Test 6: Get Available Delta Updates (Date Range)
   */
  async testGetDeltaUpdateRange(config: any, fromDate: string, toDate: string): Promise<boolean> {
    LOG.info('📅 Test 6: Get Delta Updates in Date Range');
    LOG.info('─'.repeat(60));
    
    try {
      const downloader = new SftpDownloader(config);
      
      LOG.info(`   From: ${fromDate}`);
      LOG.info(`   To:   ${toDate}`);
      
      const updates = await downloader.getAvailableDeltaUpdates(fromDate, toDate);
      
      LOG.info(`✅ Found ${updates.length} delta update(s) in range`);
      
      updates.forEach((filename, i) => {
        const date = filename.match(/\d{8}/)?.[0];
        LOG.info(`   ${i + 1}. ${filename} - Date: ${date}`);
      });
      
      return true;
      
    } catch (error: any) {
      LOG.error(`❌ Test failed: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Run all tests
   */
  async runAllTests(config: any, options: {
    skipDownloads?: boolean;
    downloadDate?: string;
    dateRange?: { from: string; to: string };
  } = {}): Promise<void> {
    LOG.info('╔════════════════════════════════════════════════════════════╗');
    LOG.info('║         SFTP DOWNLOADER TEST SUITE (SSH_ASKPASS)          ║');
    LOG.info('╚════════════════════════════════════════════════════════════╝');
    
    await this.setup();
    
    const results: { [key: string]: boolean } = {};
    
    // Test 1: Connection
    results['Connection'] = await this.testConnection(config);
    if (!results['Connection']) {
      LOG.error('\n❌ Connection failed - stopping tests');
      await this.cleanup();
      return;
    }
    
    // Test 2: Find Full Imports
    results['Find Full Imports'] = await this.testFindFullImports(config);
    
    // Test 3: Find Delta Updates
    results['Find Delta Updates'] = await this.testFindDeltaUpdates(config);
    
    // Test 4: Download Full Import (optional)
    if (!options.skipDownloads) {
      results['Download Full Import'] = await this.testDownloadFullImport(config, options.downloadDate);
    }
    
    // Test 5: Download Delta Update (optional)
    if (!options.skipDownloads) {
      results['Download Delta Update'] = await this.testDownloadDeltaUpdate(config, options.downloadDate);
    }
    
    // Test 6: Delta Update Range (optional)
    if (options.dateRange) {
      results['Delta Date Range'] = await this.testGetDeltaUpdateRange(
        config,
        options.dateRange.from,
        options.dateRange.to
      );
    }
    
    // Summary
    LOG.info('╔════════════════════════════════════════════════════════════╗');
    LOG.info('║                      TEST SUMMARY                          ║');
    LOG.info('╚════════════════════════════════════════════════════════════╝');
    
    let passed = 0;
    let failed = 0;
    
    Object.entries(results).forEach(([name, success]) => {
      const status = success ? '✅ PASS' : '❌ FAIL';
      LOG.info(`   ${status} - ${name}`);
      if (success) passed++; else failed++;
    });
    
    LOG.info('\n' + '─'.repeat(60));
    LOG.info(`   Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
    LOG.info('─'.repeat(60) + '\n');
    
    await this.cleanup();
  }
}

/**
 * ✅ Main Test Runner (ES Module compatible)
 */
async function main() {
  const args = process.argv.slice(2);
  const useDestination = args.includes('--destination');
  const skipDownloads = args.includes('--skip-downloads');
  const downloadDate = args.find(a => a.startsWith('--date='))?.split('=')[1];
  
  LOG.info('\n🧪 SFTP Downloader Test Runner');
  LOG.info('─'.repeat(60));
  
  let config: any;
  
  try {
    if (useDestination) {
      LOG.info('📍 Mode: BTP Destination Service');
      const destinationName = args.find(a => a.startsWith('--dest-name='))?.split('=')[1] || 'SFTP_SHIPDATA';
      config = await getSftpDestination(destinationName);
    } else {
      LOG.info('📍 Mode: Local .env Configuration');
      config = {
        host: process.env.SFTP_HOST || '',
        port: parseInt(process.env.SFTP_PORT || '22'),
        username: process.env.SFTP_USER || '',
        password: process.env.SFTP_PASSWORD || '',
        remotePath: process.env.SFTP_REMOTE_PATH || '/'
      };
      
      if (!config.host || !config.username || !config.password) {
        throw new Error('Missing SSH configuration in .env file');
      }
    }
    
    // Run tests
    const tester = new SftpDownloaderTest();
    await tester.runAllTests(config, {
      skipDownloads,
      downloadDate,
      dateRange: {
        from: '20240101',
        to: '20261231'
      }
    });
    
  } catch (error: any) {
    LOG.error(`\n❌ Test initialization failed: ${error.message}`);
    process.exit(1);
  }
}

// ✅ ES Module entry point check
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch(error => {
    LOG.error('Fatal error:', error);
    process.exit(1);
  });
}

export { SftpDownloaderTest };
