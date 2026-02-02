// test/test-sftp-downloader.ts
import { SftpDownloader } from '../srv/services/sftp-downloader.js';
import cds from '@sap/cds';
import { config } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

// ✅ Load .env file manually
config();

const LOG = cds.log('sftp-downloader-test');

// SFTP Configuration aus Environment
const sftpConfig = {
  host: process.env.SFTP_HOST || 'mft.ihsmarkit.com',
  port: parseInt(process.env.SFTP_PORT || '22'),
  username: process.env.SFTP_USER || '',
  password: process.env.SFTP_PASSWORD || '',
  remotePath: '/', // Not used by new downloader
};

const downloadDir = process.env.DOWNLOAD_DIR || './downloads';
const testDownloadDir = path.join(downloadDir, 'test-downloads');

const downloader = new SftpDownloader(sftpConfig);

// Test 0: List Root Files
async function testListRootFiles() {
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info('🧪 Test 0: List Root Files (Full Imports)');
  LOG.info('═══════════════════════════════════════════════════════');
  
  try {
    const files = await downloader.listFiles('/');
    
    // Filter nur ZIP-Dateien
    const zipFiles = files.filter(f => f.name.endsWith('.zip'));
    
    LOG.info('');
    LOG.info(`📦 Found ${zipFiles.length} ZIP files in root:`);
    
    // Gruppiere nach Full Imports
    const fullImports = zipFiles.filter(f => f.name.match(/^ShipData_\d{8}\.zip$/));
    
    LOG.info(`   Full Imports: ${fullImports.length}`);
    fullImports.slice(0, 5).forEach(f => {
      const sizeMB = (f.size / (1024 * 1024)).toFixed(2);
      LOG.info(`      ${f.name} (${sizeMB} MB)`);
    });
    
    if (fullImports.length > 5) {
      LOG.info(`      ... and ${fullImports.length - 5} more`);
    }
    
    LOG.info('');
    LOG.info('✅ Test 0 passed');
    return files;
    
  } catch (error) {
    LOG.error('❌ Test 0 failed:', error);
    throw error;
  }
}

// Test 1: List JSON Directory
async function testListJsonDirectory() {
  LOG.info('');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info('🧪 Test 1: List JSON Directory (Delta Updates)');
  LOG.info('═══════════════════════════════════════════════════════');
  
  try {
    const files = await downloader.listFiles('/json');
    
    // Filter nur Update-ZIP-Dateien
    const updateFiles = files.filter(f => f.name.match(/^ShipData_\d{8}_Update\.zip$/));
    
    LOG.info('');
    LOG.info(`📊 Found ${updateFiles.length} delta updates:`);
    
    updateFiles.slice(0, 10).forEach(f => {
      const sizeMB = (f.size / (1024 * 1024)).toFixed(2);
      LOG.info(`   ${f.name} (${sizeMB} MB)`);
    });
    
    if (updateFiles.length > 10) {
      LOG.info(`   ... and ${updateFiles.length - 10} more`);
    }
    
    LOG.info('');
    LOG.info('✅ Test 1 passed');
    return files;
    
  } catch (error) {
    LOG.error('❌ Test 1 failed:', error);
    throw error;
  }
}

// Test 2: Download Latest Full Import
async function testDownloadLatestFullImport() {
  LOG.info('');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info('🧪 Test 2: Download Latest Full Import');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info('⚠️  WARNING: This will download a large file!');
  LOG.info('');
  
  try {
    const fullDir = path.join(testDownloadDir, 'full-import');
    
    // Verzeichnis aufräumen falls vorhanden
    if (fs.existsSync(fullDir)) {
      LOG.info('🧹 Cleaning up old test directory...');
      fs.rmSync(fullDir, { recursive: true });
    }
    
    fs.mkdirSync(fullDir, { recursive: true });
    
    const startTime = Date.now();
    const result = await downloader.downloadFullImport(fullDir);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    LOG.info('');
    LOG.info('📊 Download Results:');
    LOG.info(`   Type: ${result.type}`);
    LOG.info(`   Date: ${result.date}`);
    LOG.info(`   Format: ${result.format}`);
    LOG.info(`   Files: ${result.files.length}`);
    LOG.info(`   Primary File: ${result.primaryFile ? path.basename(result.primaryFile) : 'N/A'}`);
    LOG.info(`   Duration: ${duration}s`);
    
    if (result.format === 'mdb' && result.primaryFile) {
      const stats = fs.statSync(result.primaryFile);
      LOG.info(`   MDB Size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
    }
    
    LOG.info('');
    LOG.info('✅ Test 2 passed');
    return result;
    
  } catch (error) {
    LOG.error('❌ Test 2 failed:', error);
    throw error;
  }
}

// Test 3: Download Specific Full Import
async function testDownloadSpecificFullImport(date: string) {
  LOG.info('');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info(`🧪 Test 3: Download Specific Full Import (${date})`);
  LOG.info('═══════════════════════════════════════════════════════');
  
  try {
    const fullDir = path.join(testDownloadDir, `full-import-${date}`);
    
    // Verzeichnis aufräumen falls vorhanden
    if (fs.existsSync(fullDir)) {
      LOG.info('🧹 Cleaning up old test directory...');
      fs.rmSync(fullDir, { recursive: true });
    }
    
    fs.mkdirSync(fullDir, { recursive: true });
    
    const startTime = Date.now();
    const result = await downloader.downloadFullImport(fullDir, date);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    LOG.info('');
    LOG.info('📊 Download Results:');
    LOG.info(`   Type: ${result.type}`);
    LOG.info(`   Date: ${result.date}`);
    LOG.info(`   Format: ${result.format}`);
    LOG.info(`   Files: ${result.files.length}`);
    LOG.info(`   Primary File: ${result.primaryFile ? path.basename(result.primaryFile) : 'N/A'}`);
    LOG.info(`   Duration: ${duration}s`);
    
    LOG.info('');
    LOG.info('✅ Test 3 passed');
    return result;
    
  } catch (error) {
    LOG.error('❌ Test 3 failed:', error);
    throw error;
  }
}

// Test 4: Download Latest Delta Update
async function testDownloadLatestDelta() {
  LOG.info('');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info('🧪 Test 4: Download Latest Delta Update');
  LOG.info('═══════════════════════════════════════════════════════');
  
  try {
    const deltaDir = path.join(testDownloadDir, 'delta-update');
    
    // Verzeichnis aufräumen falls vorhanden
    if (fs.existsSync(deltaDir)) {
      LOG.info('🧹 Cleaning up old test directory...');
      fs.rmSync(deltaDir, { recursive: true });
    }
    
    fs.mkdirSync(deltaDir, { recursive: true });
    
    const startTime = Date.now();
    const result = await downloader.downloadDeltaUpdate(deltaDir);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    LOG.info('');
    LOG.info('📊 Download Results:');
    LOG.info(`   Type: ${result.type}`);
    LOG.info(`   Date: ${result.date}`);
    LOG.info(`   Format: ${result.format}`);
    LOG.info(`   Files: ${result.files.length}`);
    
    if (result.files.length > 0) {
      LOG.info(`   JSON Files:`);
      result.files.forEach(f => {
        const stats = fs.statSync(f);
        const sizeKB = (stats.size / 1024).toFixed(2);
        LOG.info(`      ${path.basename(f)} (${sizeKB} KB)`);
      });
    }
    
    LOG.info(`   Duration: ${duration}s`);
    
    LOG.info('');
    LOG.info('✅ Test 4 passed');
    return result;
    
  } catch (error) {
    LOG.error('❌ Test 4 failed:', error);
    throw error;
  }
}

// Test 5: Download Specific Delta Update
async function testDownloadSpecificDelta(date: string) {
  LOG.info('');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info(`🧪 Test 5: Download Specific Delta Update (${date})`);
  LOG.info('═══════════════════════════════════════════════════════');
  
  try {
    const deltaDir = path.join(testDownloadDir, `delta-update-${date}`);
    
    // Verzeichnis aufräumen falls vorhanden
    if (fs.existsSync(deltaDir)) {
      LOG.info('🧹 Cleaning up old test directory...');
      fs.rmSync(deltaDir, { recursive: true });
    }
    
    fs.mkdirSync(deltaDir, { recursive: true });
    
    const startTime = Date.now();
    const result = await downloader.downloadDeltaUpdate(deltaDir, date);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    LOG.info('');
    LOG.info('📊 Download Results:');
    LOG.info(`   Type: ${result.type}`);
    LOG.info(`   Date: ${result.date}`);
    LOG.info(`   Format: ${result.format}`);
    LOG.info(`   Files: ${result.files.length}`);
    LOG.info(`   Duration: ${duration}s`);
    
    LOG.info('');
    LOG.info('✅ Test 5 passed');
    return result;
    
  } catch (error) {
    LOG.error('❌ Test 5 failed:', error);
    throw error;
  }
}

// Test 6: Get Available Delta Updates in Range
async function testGetAvailableDeltaUpdates(fromDate: string, toDate: string) {
  LOG.info('');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info(`🧪 Test 6: Get Available Delta Updates (${fromDate} - ${toDate})`);
  LOG.info('═══════════════════════════════════════════════════════');
  
  try {
    const deltaUpdates = await downloader.getAvailableDeltaUpdates(fromDate, toDate);
    
    LOG.info('');
    LOG.info(`📊 Found ${deltaUpdates.length} delta updates in range:`);
    
    deltaUpdates.forEach(filename => {
      LOG.info(`   ${filename}`);
    });
    
    LOG.info('');
    LOG.info('✅ Test 6 passed');
    return deltaUpdates;
    
  } catch (error) {
    LOG.error('❌ Test 6 failed:', error);
    throw error;
  }
}

// Main test runner
async function runTests() {
  LOG.info('');
  LOG.info('╔═══════════════════════════════════════════════════════╗');
  LOG.info('║       🚀 SFTP DOWNLOADER - TEST SUITE                ║');
  LOG.info('╚═══════════════════════════════════════════════════════╝');
  LOG.info('');
  
  // Validate config
  if (!sftpConfig.username || !sftpConfig.password) {
    LOG.error('❌ SFTP credentials missing!');
    LOG.error('   Set SFTP_USER and SFTP_PASSWORD environment variables');
    LOG.error('   in your .env file');
    process.exit(1);
  }
  
  LOG.info('📋 Configuration:');
  LOG.info(`   Host: ${sftpConfig.host}:${sftpConfig.port}`);
  LOG.info(`   User: ${sftpConfig.username}`);
  LOG.info(`   Download Dir: ${testDownloadDir}`);
  LOG.info('');
  
  // Erstelle Test-Download-Verzeichnis
  if (!fs.existsSync(testDownloadDir)) {
    fs.mkdirSync(testDownloadDir, { recursive: true });
  }
  
  try {
    // Test 0: List root files
    await testListRootFiles();
    
    // Test 1: List JSON directory
    await testListJsonDirectory();
    
    // Test 4: Download latest delta (klein, schnell)
    //await testDownloadLatestDelta();
    
    // Test 5: Download specific delta (optional)
    // await testDownloadSpecificDelta('20260131');
    
    // Test 6: Get available delta updates in range
    const today = new Date();
    const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fromDate = oneWeekAgo.toISOString().slice(0, 10).replace(/-/g, '');
    const toDate = today.toISOString().slice(0, 10).replace(/-/g, '');
    await testGetAvailableDeltaUpdates(fromDate, toDate);
    
    // ═══════════════════════════════════════════════════════════
    // WARNUNG: Full Import Tests (nur wenn nötig!)
    // Diese Tests laden GROSSE Dateien herunter!
    // ═══════════════════════════════════════════════════════════
    
    // Test 2: Download latest full import (optional, GROSS!)
     await testDownloadLatestFullImport();
    
    // Test 3: Download specific full import (optional, GROSS!)
    // await testDownloadSpecificFullImport('20260119');
    
    LOG.info('');
    LOG.info('╔═══════════════════════════════════════════════════════╗');
    LOG.info('║            🎉 ALL TESTS PASSED!                       ║');
    LOG.info('╚═══════════════════════════════════════════════════════╝');
    LOG.info('');
    LOG.info('💡 Nächste Schritte:');
    LOG.info('   1. Teste Full Import Downloads (auskommentiert)');
    LOG.info('   2. Integriere Downloader in ShipImportService');
    LOG.info('   3. Implementiere JSON/MDB Verarbeitung');
    LOG.info('');
    LOG.info('📂 Test-Downloads befinden sich in:');
    LOG.info(`   ${testDownloadDir}`);
    LOG.info('');
    
  } catch (error) {
    LOG.error('');
    LOG.error('╔═══════════════════════════════════════════════════════╗');
    LOG.error('║            💥 TEST SUITE FAILED                       ║');
    LOG.error('╚═══════════════════════════════════════════════════════╝');
    LOG.error('');
    LOG.error(`Error: ${(error as Error).message}`);
    LOG.error('');
    if ((error as Error).stack) {
      LOG.error('Stack trace:');
      LOG.error((error as Error).stack);
    }
    LOG.error('');
    process.exit(1);
  }
}

// Run tests
runTests();
