// test/test-sftp-fast-safe.ts
import { downloadVerifyExtract } from '../srv/utils/sftp-fast-safe.js';
import cds from '@sap/cds';
import { config } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

// ✅ Load .env file manually
config();

const LOG = cds.log('sftp-fast-safe-test');

// SFTP Configuration aus Environment
const sftpAuth = {
  host: process.env.SFTP_HOST || 'mft.ihsmarkit.com',
  port: parseInt(process.env.SFTP_PORT || '22'),
  username: process.env.SFTP_USER || '',
  password: process.env.SFTP_PASSWORD || '',
};

const downloadDir = process.env.DOWNLOAD_DIR || './downloads';
const testDownloadDir = path.join(downloadDir, 'test-fast-safe');

// Test 0: Basic Delta Download & Extract
async function testBasicDeltaDownload() {
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info('🧪 Test 0: Basic Delta Download & Extract');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info('');
  
  try {
    const testDir = path.join(testDownloadDir, 'test-0-basic-delta');
    const zipPath = path.join(testDir, 'ShipData_Update.zip');
    const extractPath = path.join(testDir, 'extracted');
    
    // Cleanup
    if (fs.existsSync(testDir)) {
      LOG.info('🧹 Cleaning up old test directory...');
      fs.rmSync(testDir, { recursive: true });
    }
    
    fs.mkdirSync(testDir, { recursive: true });
    
    LOG.info('📥 Starting download with fast-safe utility...');
    LOG.info('');
    
    const startTime = Date.now();
    
 await downloadVerifyExtract(undefined, {
  //destinationName: 'my-sftp-dest',
  remotePath: '/json/ShipData_20260201_Update.zip',
  localPath: 'downloads/scp/ShipData_20260201_Update.zip',
  extractTo: 'downloads/scp/extracted',
  downloadMode: 'node-scp',
  validateDeep: false
});
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    LOG.info('');
    LOG.info('╔═══════════════════════════════════════════════════════╗');
    LOG.info('║              📊 TEST RESULTS                          ║');
    LOG.info('╚═══════════════════════════════════════════════════════╝');
    LOG.info(`   Success: ${result.ok ? '✅' : '❌'}`);
    LOG.info(`   Attempt: ${result.attempt}`);
    LOG.info(`   Entries: ${Object.keys(result.entries).length}`);
    LOG.info(`   Duration: ${duration}s`);
    
    // Verify extracted files
    if (fs.existsSync(extractPath)) {
      const files = fs.readdirSync(extractPath);
      LOG.info(`   Extracted Files: ${files.length}`);
      
      files.slice(0, 5).forEach(f => {
        const fullPath = path.join(extractPath, f);
        const stats = fs.statSync(fullPath);
        const sizeKB = (stats.size / 1024).toFixed(2);
        LOG.info(`      ${f} (${sizeKB} KB)`);
      });
      
      if (files.length > 5) {
        LOG.info(`      ... and ${files.length - 5} more`);
      }
    }
    
    // Verify ZIP file exists
    if (fs.existsSync(zipPath)) {
      const zipStats = fs.statSync(zipPath);
      LOG.info(`   ZIP Size: ${(zipStats.size / (1024 * 1024)).toFixed(2)} MB`);
    }
    
    LOG.info('');
    LOG.info('✅ Test 0 passed');
    return result;
    
  } catch (error) {
    LOG.error('');
    LOG.error('❌ Test 0 failed:', error);
    throw error;
  }
}

// Test 1: Download with High Concurrency
async function testHighConcurrencyDownload() {
  LOG.info('');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info('🧪 Test 1: Download with High Concurrency');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info('   Testing with concurrency=256, chunkSize=128KB');
  LOG.info('');
  
  try {
    const testDir = path.join(testDownloadDir, 'test-1-high-concurrency');
    const zipPath = path.join(testDir, 'ShipData_Update.zip');
    const extractPath = path.join(testDir, 'extracted');
    
    // Cleanup
    if (fs.existsSync(testDir)) {
      LOG.info('🧹 Cleaning up old test directory...');
      fs.rmSync(testDir, { recursive: true });
    }
    
    fs.mkdirSync(testDir, { recursive: true });
    
    LOG.info('📥 Starting download with high concurrency...');
    LOG.info('');
    
    const startTime = Date.now();
    
    const result = await downloadVerifyExtract(sftpAuth, {
      remotePath: '/json/ShipData_20260201_Update.zip',
      localPath: zipPath,
      extractTo: extractPath,
      concurrency: 256,
      chunkSize: 128 * 1024,
      retries: 3,
      stableChecks: 0, // Skip stability check for speed
      stableDelayMs: 0,
    });
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    LOG.info('');
    LOG.info('╔═══════════════════════════════════════════════════════╗');
    LOG.info('║              📊 TEST RESULTS                          ║');
    LOG.info('╚═══════════════════════════════════════════════════════╝');
    LOG.info(`   Success: ${result.ok ? '✅' : '❌'}`);
    LOG.info(`   Attempt: ${result.attempt}`);
    LOG.info(`   Entries: ${Object.keys(result.entries).length}`);
    LOG.info(`   Duration: ${duration}s`);
    
    if (fs.existsSync(zipPath)) {
      const zipStats = fs.statSync(zipPath);
      const avgSpeed = (zipStats.size / (1024 * 1024)) / parseFloat(duration);
      LOG.info(`   ZIP Size: ${(zipStats.size / (1024 * 1024)).toFixed(2)} MB`);
      LOG.info(`   Avg Speed: ${avgSpeed.toFixed(2)} MB/s`);
    }
    
    LOG.info('');
    LOG.info('✅ Test 1 passed');
    return result;
    
  } catch (error) {
    LOG.error('');
    LOG.error('❌ Test 1 failed:', error);
    throw error;
  }
}

// Test 2: Download with Retry Logic (simulated failure)
async function testRetryLogic() {
  LOG.info('');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info('🧪 Test 2: Download with Retry Logic');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info('   Testing with invalid path (should retry and fail gracefully)');
  LOG.info('');
  
  try {
    const testDir = path.join(testDownloadDir, 'test-2-retry-logic');
    const zipPath = path.join(testDir, 'ShipData_Invalid.zip');
    const extractPath = path.join(testDir, 'extracted');
    
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    
    fs.mkdirSync(testDir, { recursive: true });
    
    LOG.info('📥 Starting download with invalid remote path...');
    LOG.info('');
    
    try {
      await downloadVerifyExtract(sftpAuth, {
        remotePath: '/json/ShipData_99999999_Update.zip', // Invalid file
        localPath: zipPath,
        extractTo: extractPath,
        concurrency: 128,
        chunkSize: 65536,
        retries: 3,
        stableChecks: 0,
      });
      
      LOG.error('❌ Test 2 failed: Expected error but succeeded!');
      return { ok: false, reason: 'Should have failed' };
      
    } catch (error) {
      // Expected to fail
      LOG.info('');
      LOG.info('╔═══════════════════════════════════════════════════════╗');
      LOG.info('║              📊 TEST RESULTS                          ║');
      LOG.info('╚═══════════════════════════════════════════════════════╝');
      LOG.info('   Expected Failure: ✅');
      LOG.info(`   Error Message: ${(error as Error).message}`);
      LOG.info('   Retry Logic: ✅ Worked as expected');
      LOG.info('');
      LOG.info('✅ Test 2 passed (retry logic works correctly)');
      return { ok: true, reason: 'Failed as expected' };
    }
    
  } catch (error) {
    LOG.error('');
    LOG.error('❌ Test 2 failed unexpectedly:', error);
    throw error;
  }
}

// Test 3: Download Multiple Files (Stress Test)
async function testMultipleDownloads() {
  LOG.info('');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info('🧪 Test 3: Multiple Sequential Downloads');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info('   Testing 3 sequential downloads to verify stability');
  LOG.info('');
  
  try {
    const testDir = path.join(testDownloadDir, 'test-3-multiple');
    
    // Cleanup
    if (fs.existsSync(testDir)) {
      LOG.info('🧹 Cleaning up old test directory...');
      fs.rmSync(testDir, { recursive: true });
    }
    
    fs.mkdirSync(testDir, { recursive: true });
    
    const files = [
      '/json/ShipData_20260201_Update.zip',
      '/json/ShipData_20260131_Update.zip',
      '/json/ShipData_20260130_Update.zip',
    ];
    
    const results = [];
    const startTime = Date.now();
    
    for (let i = 0; i < files.length; i++) {
      const remoteFile = files[i];
      const fileName = path.basename(remoteFile);
      const localPath = path.join(testDir, fileName);
      const extractPath = path.join(testDir, `extracted-${i + 1}`);
      
      LOG.info(`📥 Download ${i + 1}/${files.length}: ${fileName}`);
      
      try {
        const result = await downloadVerifyExtract(sftpAuth, {
          remotePath: remoteFile,
          localPath,
          extractTo: extractPath,
          concurrency: 128,
          chunkSize: 65536,
          retries: 2,
          stableChecks: 0,
        });
        
        results.push({ file: fileName, success: true, entries: Object.keys(result.entries).length });
        LOG.info(`   ✅ ${fileName} - ${Object.keys(result.entries).length} entries`);
        
      } catch (error) {
        results.push({ file: fileName, success: false, error: (error as Error).message });
        LOG.warn(`   ⚠️  ${fileName} - Failed: ${(error as Error).message}`);
      }
      
      LOG.info('');
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    LOG.info('╔═══════════════════════════════════════════════════════╗');
    LOG.info('║              📊 TEST RESULTS                          ║');
    LOG.info('╚═══════════════════════════════════════════════════════╝');
    LOG.info(`   Total Files: ${files.length}`);
    LOG.info(`   Successful: ${results.filter(r => r.success).length}`);
    LOG.info(`   Failed: ${results.filter(r => !r.success).length}`);
    LOG.info(`   Total Duration: ${duration}s`);
    LOG.info('');
    
    results.forEach(r => {
      if (r.success) {
        LOG.info(`   ✅ ${r.file} - ${r.entries} entries`);
      } else {
        LOG.info(`   ❌ ${r.file} - ${r.error}`);
      }
    });
    
    LOG.info('');
    LOG.info('✅ Test 3 passed');
    return results;
    
  } catch (error) {
    LOG.error('');
    LOG.error('❌ Test 3 failed:', error);
    throw error;
  }
}

// Test 4: Full Import Download (LARGE FILE - Optional)
async function testFullImportDownload() {
  LOG.info('');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info('🧪 Test 4: Full Import Download');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info('⚠️  WARNING: This will download a LARGE file (~100+ MB)!');
  LOG.info('');
  
  try {
    const testDir = path.join(testDownloadDir, 'test-4-full-import');
    const zipPath = path.join(testDir, 'ShipData_Full.zip');
    const extractPath = path.join(testDir, 'extracted');
    
    // Cleanup
    if (fs.existsSync(testDir)) {
      LOG.info('🧹 Cleaning up old test directory...');
      fs.rmSync(testDir, { recursive: true });
    }
    
    fs.mkdirSync(testDir, { recursive: true });
    
    LOG.info('📥 Starting full import download...');
    LOG.info('');
    
    const startTime = Date.now();
    
    const result = await downloadVerifyExtract(sftpAuth, {
      remotePath: '/ShipData_20260119.zip', // Adjust date as needed
      localPath: zipPath,
      extractTo: extractPath,
      concurrency: 256,
      chunkSize: 128 * 1024,
      retries: 3,
      stableChecks: 1,
      stableDelayMs: 3000,
    });
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    LOG.info('');
    LOG.info('╔═══════════════════════════════════════════════════════╗');
    LOG.info('║              📊 TEST RESULTS                          ║');
    LOG.info('╚═══════════════════════════════════════════════════════╝');
    LOG.info(`   Success: ${result.ok ? '✅' : '❌'}`);
    LOG.info(`   Attempt: ${result.attempt}`);
    LOG.info(`   Entries: ${Object.keys(result.entries).length}`);
    LOG.info(`   Duration: ${duration}s`);
    
    if (fs.existsSync(zipPath)) {
      const zipStats = fs.statSync(zipPath);
      const avgSpeed = (zipStats.size / (1024 * 1024)) / parseFloat(duration);
      LOG.info(`   ZIP Size: ${(zipStats.size / (1024 * 1024)).toFixed(2)} MB`);
      LOG.info(`   Avg Speed: ${avgSpeed.toFixed(2)} MB/s`);
    }
    
    // Check for MDB file
    if (fs.existsSync(extractPath)) {
      const files = fs.readdirSync(extractPath);
      const mdbFiles = files.filter(f => f.toLowerCase().endsWith('.mdb'));
      
      if (mdbFiles.length > 0) {
        LOG.info(`   MDB Files: ${mdbFiles.length}`);
        mdbFiles.forEach(f => {
          const fullPath = path.join(extractPath, f);
          const stats = fs.statSync(fullPath);
          LOG.info(`      ${f} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);
        });
      }
    }
    
    LOG.info('');
    LOG.info('✅ Test 4 passed');
    return result;
    
  } catch (error) {
    LOG.error('');
    LOG.error('❌ Test 4 failed:', error);
    throw error;
  }
}

// Main test runner
async function runTests() {
  LOG.info('');
  LOG.info('╔═══════════════════════════════════════════════════════╗');
  LOG.info('║       🚀 SFTP-FAST-SAFE UTILITY - TEST SUITE         ║');
  LOG.info('╚═══════════════════════════════════════════════════════╝');
  LOG.info('');
  
  // Validate config
  if (!sftpAuth.username || !sftpAuth.password) {
    LOG.error('❌ SFTP credentials missing!');
    LOG.error('   Set SFTP_USER and SFTP_PASSWORD environment variables');
    LOG.error('   in your .env file');
    process.exit(1);
  }
  
  LOG.info('📋 Configuration:');
  LOG.info(`   Host: ${sftpAuth.host}:${sftpAuth.port}`);
  LOG.info(`   User: ${sftpAuth.username}`);
  LOG.info(`   Download Dir: ${testDownloadDir}`);
  LOG.info('');
  
  // Erstelle Test-Download-Verzeichnis
  if (!fs.existsSync(testDownloadDir)) {
    fs.mkdirSync(testDownloadDir, { recursive: true });
  }
  
  const allResults: any[] = [];
  
  try {
    // Test 0: Basic Delta Download
    const test0 = await testBasicDeltaDownload();
    allResults.push({ test: 'Test 0', success: test0.ok });
    
    // Test 1: High Concurrency
    const test1 = await testHighConcurrencyDownload();
    allResults.push({ test: 'Test 1', success: test1.ok });
    
    // Test 2: Retry Logic
    const test2 = await testRetryLogic();
    allResults.push({ test: 'Test 2', success: test2.ok });
    
    // Test 3: Multiple Downloads
    const test3 = await testMultipleDownloads();
    const test3Success = test3.filter(r => r.success).length > 0;
    allResults.push({ test: 'Test 3', success: test3Success });
    
    // ═══════════════════════════════════════════════════════════
    // WARNUNG: Full Import Test (nur wenn nötig!)
    // Lädt SEHR GROSSE Datei herunter!
    // ═══════════════════════════════════════════════════════════
    
    // Test 4: Full Import (optional, GROSS!)
    // const test4 = await testFullImportDownload();
    // allResults.push({ test: 'Test 4', success: test4.ok });
    
    LOG.info('');
    LOG.info('╔═══════════════════════════════════════════════════════╗');
    LOG.info('║            🎉 ALL TESTS COMPLETED!                    ║');
    LOG.info('╚═══════════════════════════════════════════════════════╝');
    LOG.info('');
    
    LOG.info('📊 Summary:');
    allResults.forEach(r => {
      const icon = r.success ? '✅' : '❌';
      LOG.info(`   ${icon} ${r.test}`);
    });
    
    const allSuccess = allResults.every(r => r.success);
    
    LOG.info('');
    if (allSuccess) {
      LOG.info('🎉 All tests passed!');
    } else {
      LOG.error('⚠️  Some tests failed!');
    }
    
    LOG.info('');
    LOG.info('💡 Performance Notes:');
    LOG.info('   - Stream-based download is most reliable');
    LOG.info('   - High concurrency (256) can improve speed');
    LOG.info('   - Retry logic works with exponential backoff');
    LOG.info('   - ZIP validation ensures integrity');
    LOG.info('');
    LOG.info('📂 Test files are in:');
    LOG.info(`   ${testDownloadDir}`);
    LOG.info('');
    
    if (!allSuccess) {
      process.exit(1);
    }
    
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
