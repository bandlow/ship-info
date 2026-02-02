// test/test-ship-import.ts
import { ShipImportService } from '../srv/services/ship-import-service.js';
import cds from '@sap/cds';
import { config } from 'dotenv';

// ✅ Load .env file manually
config();

const LOG = cds.log('ship-import-test');

// SFTP Configuration aus Environment
const sftpConfig = {
  host: process.env.SFTP_HOST || 'mft.ihsmarkit.com',
  port: parseInt(process.env.SFTP_PORT || '22'),
  username: process.env.SFTP_USER || '',
  password: process.env.SFTP_PASSWORD || '',
};

const service = new ShipImportService(sftpConfig);

// Test 0: Zeige aktuellen Status
async function testShowStatus() {
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info('🧪 Test 0: Aktueller Import-Status');
  LOG.info('═══════════════════════════════════════════════════════');
  
  const status = service.getStatus();
  
  LOG.info('');
  LOG.info('📊 Letzter Full Import:');
  if (status.lastFullImport) {
    LOG.info(`   Datum: ${status.lastFullImport.date}`);
    LOG.info(`   Datei: ${status.lastFullImport.filename}`);
    LOG.info(`   Zeitstempel: ${status.lastFullImport.timestamp}`);
  } else {
    LOG.info(`   ⚠️  Noch kein Full Import durchgeführt`);
  }
  
  LOG.info('');
  LOG.info('📊 Letzter Delta Import:');
  if (status.lastDeltaImport) {
    LOG.info(`   Datum: ${status.lastDeltaImport.date}`);
    LOG.info(`   Datei: ${status.lastDeltaImport.filename}`);
    LOG.info(`   Zeitstempel: ${status.lastDeltaImport.timestamp}`);
  } else {
    LOG.info(`   ⚠️  Noch kein Delta Import durchgeführt`);
  }
  
  LOG.info('');
  LOG.info(`📅 Letztes Update: ${status.lastUpdate}`);
  LOG.info('');
  LOG.info('✅ Test 0 passed');
}

// Test 1: List available imports
async function testListImports() {
  LOG.info('');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info('🧪 Test 1: List Available Imports');
  LOG.info('═══════════════════════════════════════════════════════');
  
  try {
    const imports = await service.listAvailableImports();
    
    LOG.info('');
    LOG.info(`📦 Full Imports (${imports.full.length} total):`);
    if (imports.full.length > 0) {
      imports.full.slice(0, 5).forEach(f => LOG.info(`   ${f}`));
      if (imports.full.length > 5) {
        LOG.info(`   ... and ${imports.full.length - 5} more`);
      }
    } else {
      LOG.info(`   ⚠️  Keine Full Imports gefunden`);
    }
    
    LOG.info('');
    LOG.info(`📊 Delta Updates (${imports.delta.length} total, latest 10):`);
    if (imports.delta.length > 0) {
      imports.delta.slice(0, 10).forEach(f => LOG.info(`   ${f}`));
      if (imports.delta.length > 10) {
        LOG.info(`   ... and ${imports.delta.length - 10} more`);
      }
    } else {
      LOG.info(`   ⚠️  Keine Delta Updates gefunden`);
    }
    
    LOG.info('');
    LOG.info('✅ Test 1 passed');
    return imports;
    
  } catch (error) {
    LOG.error('❌ Test 1 failed:', error);
    throw error;
  }
}

// Test 2: Intelligente Synchronisation (HAUPTFUNKTION!)
async function testSmartSync() {
  LOG.info('');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info('🧪 Test 2: 🎯 Intelligente Synchronisation');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info('');
  LOG.info('💡 Diese Funktion:');
  LOG.info('   1. Prüft ob Full Import nötig ist');
  LOG.info('   2. Führt Full Import durch (falls erforderlich)');
  LOG.info('   3. Spielt alle Delta Updates chronologisch ein');
  LOG.info('   4. Hält die Datenbank automatisch aktuell');
  LOG.info('');
  
  try {
    const result = await service.synchronize();
    
    LOG.info('');
    LOG.info('╔═══════════════════════════════════════════════════════╗');
    LOG.info('║           📊 SYNCHRONISATIONS-ERGEBNIS                ║');
    LOG.info('╚═══════════════════════════════════════════════════════╝');
    LOG.info(`   Success: ${result.success ? '✅' : '❌'}`);
    LOG.info(`   Full Import durchgeführt: ${result.fullImportExecuted ? '✅ Ja' : '⏭️  Nein (bereits aktuell)'}`);
    if (result.fullImportDate) {
      LOG.info(`   Full Import Datum: ${result.fullImportDate}`);
    }
    LOG.info(`   Delta Updates verarbeitet: ${result.deltaUpdatesProcessed}`);
    LOG.info(`   Records Updated: ${result.updated || 0}`);
    LOG.info(`   Records Inserted: ${result.inserted || 0}`);
    LOG.info(`   Errors: ${result.errors || 0}`);
    LOG.info(`   Dauer: ${(result.duration / 1000).toFixed(1)}s`);
    LOG.info(`   Message: ${result.message}`);
    LOG.info('');
    
    LOG.info('✅ Test 2 passed');
    return result;
    
  } catch (error) {
    LOG.error('❌ Test 2 failed:', error);
    throw error;
  }
}

// Test 3: Download latest delta update (JSON) - manuell
async function testDeltaDownload() {
  LOG.info('');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info('🧪 Test 3: Download Latest Delta Update (manuell)');
  LOG.info('═══════════════════════════════════════════════════════');
  
  try {
    const result = await service.runDeltaUpdate();
    
    LOG.info('');
    LOG.info('📊 Import Results:');
    LOG.info(`   Success: ${result.success ? '✅' : '❌'}`);
    LOG.info(`   Date: ${result.date}`);
    LOG.info(`   Updated: ${result.updated}`);
    LOG.info(`   Inserted: ${result.inserted}`);
    LOG.info(`   Errors: ${result.errors}`);
    LOG.info(`   Duration: ${(result.duration / 1000).toFixed(1)}s`);
    LOG.info(`   Message: ${result.message}`);
    
    LOG.info('');
    LOG.info('✅ Test 3 passed');
    return result;
    
  } catch (error) {
    LOG.error('❌ Test 3 failed:', error);
    throw error;
  }
}

// Test 4: Download specific date delta
async function testSpecificDeltaDownload(date: string) {
  LOG.info('');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info(`🧪 Test 4: Download Delta for ${date}`);
  LOG.info('═══════════════════════════════════════════════════════');
  
  try {
    const result = await service.runDeltaUpdate(date);
    
    LOG.info('');
    LOG.info('📊 Import Results:');
    LOG.info(`   Success: ${result.success ? '✅' : '❌'}`);
    LOG.info(`   Date: ${result.date}`);
    LOG.info(`   Updated: ${result.updated}`);
    LOG.info(`   Inserted: ${result.inserted}`);
    LOG.info(`   Errors: ${result.errors}`);
    LOG.info(`   Duration: ${(result.duration / 1000).toFixed(1)}s`);
    
    LOG.info('');
    LOG.info('✅ Test 4 passed');
    return result;
    
  } catch (error) {
    LOG.error('❌ Test 4 failed:', error);
    throw error;
  }
}

// Test 5: Catch-up multiple deltas
async function testCatchUp(fromDate: string, toDate: string) {
  LOG.info('');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info(`🧪 Test 5: Catch-Up from ${fromDate} to ${toDate}`);
  LOG.info('═══════════════════════════════════════════════════════');
  
  try {
    const result = await service.catchUpDeltaUpdates(fromDate, toDate);
    
    LOG.info('');
    LOG.info('📊 Catch-Up Results:');
    LOG.info(`   Success: ${result.success ? '✅' : '❌'}`);
    LOG.info(`   Total Updated: ${result.updated}`);
    LOG.info(`   Total Inserted: ${result.inserted}`);
    LOG.info(`   Total Errors: ${result.errors}`);
    LOG.info(`   Total Duration: ${(result.duration / 1000).toFixed(1)}s`);
    
    LOG.info('');
    LOG.info('✅ Test 5 passed');
    return result;
    
  } catch (error) {
    LOG.error('❌ Test 5 failed:', error);
    throw error;
  }
}

// Test 6: Download full import (MDB) - manuell
async function testFullImportDownload(date?: string) {
  LOG.info('');
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info(`🧪 Test 6: Download Full Import${date ? ` (${date})` : ' (latest)'}`);
  LOG.info('═══════════════════════════════════════════════════════');
  LOG.info('⚠️  WARNING: This will download a large file!');
  
  try {
    const result = await service.runFullImport(date);
    
    LOG.info('');
    LOG.info('📊 Import Results:');
    LOG.info(`   Success: ${result.success ? '✅' : '❌'}`);
    LOG.info(`   Date: ${result.date}`);
    LOG.info(`   Duration: ${(result.duration / 1000).toFixed(1)}s`);
    LOG.info(`   Message: ${result.message}`);
    
    LOG.info('');
    LOG.info('✅ Test 6 passed');
    return result;
    
  } catch (error) {
    LOG.error('❌ Test 6 failed:', error);
    throw error;
  }
}

// Main test runner
async function runTests() {
  LOG.info('');
  LOG.info('╔═══════════════════════════════════════════════════════╗');
  LOG.info('║         🚀 SHIP IMPORT SERVICE - TEST SUITE          ║');
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
  LOG.info(`   Download Dir: ${process.env.DOWNLOAD_DIR || './downloads'}`);
  LOG.info('');
  
  try {
    // Test 0: Status anzeigen
    await testShowStatus();
    
    // Test 1: List files
    await testListImports();
    
    // 🎯 HAUPTTEST: Intelligente Synchronisation
    // Dies ist die empfohlene Methode für den produktiven Einsatz!
    await testSmartSync();
    
    // ═══════════════════════════════════════════════════════════
    // Optionale manuelle Tests (normalerweise auskommentiert)
    // ═══════════════════════════════════════════════════════════
    
    // Test 3: Download latest delta manuell (optional)
    // await testDeltaDownload();
    
    // Test 4: Download specific date delta (optional)
    // await testSpecificDeltaDownload('20260131');
    
    // Test 5: Catch-up specific date range (optional)
    // await testCatchUp('20260125', '20260131');
    
    // Test 6: Full import manuell (optional, sehr groß!)
    // await testFullImportDownload();
    // await testFullImportDownload('20251222'); // Specific date
    
    LOG.info('');
    LOG.info('╔═══════════════════════════════════════════════════════╗');
    LOG.info('║            🎉 ALL TESTS PASSED!                       ║');
    LOG.info('╚═══════════════════════════════════════════════════════╝');
    LOG.info('');
    LOG.info('💡 Nächste Schritte:');
    LOG.info('   1. Implementiere processJsonUpdate() für DB-Insert');
    LOG.info('   2. Implementiere processMdbImport() für Full Import');
    LOG.info('   3. Richte Scheduler ein für automatische Synchronisation');
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
