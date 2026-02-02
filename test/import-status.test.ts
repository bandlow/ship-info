// test/import-status.test.ts
import cds from '@sap/cds';

async function showImportStatus() {
  const db = await cds.connect.to('db');
  
  console.log('📊 Import Status');
  console.log('═══════════════════════════════════════════');
  console.log('');
  
  // Letzte Imports
  const imports = await db.run(`
    SELECT importType, dataVersion, importDate, status, recordsImported, duration
    FROM shipinfo_importInfo
    ORDER BY importDate DESC
    LIMIT 10
  `);
  
  console.log('📜 Recent Imports:');
  for (const imp of imports) {
    const status = imp.status === 'SUCCESS' ? '✅' : '❌';
    console.log(`   ${status} ${imp.importType} ${imp.dataVersion} - ${imp.recordsImported?.toLocaleString() || 0} rows (${imp.duration}s)`);
  }
  
  console.log('');
  
  // Aktueller Stand
  const status = await db.run(`
    SELECT * FROM shipinfo_entityUpdateStatus
  `);
  
  if (status.length > 0) {
    console.log('🎯 Current Version:');
    console.log(`   ${status[0].lastDataVersion}`);
    console.log(`   Last Full: ${status[0].lastFullImport || 'Never'}`);
    console.log(`   Last Delta: ${status[0].lastDeltaImport || 'Never'}`);
  }
  
  process.exit(0);
}

showImportStatus();
