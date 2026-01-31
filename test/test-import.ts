// test/test-import.ts
import cds from '@sap/cds';

async function testImport() {
  try {
    // Verbindung zur DB
    await cds.connect.to('db');
    
    const importService = await cds.connect.to('ImportService');
    
    // 1. MDB Full Import
    console.log('=== MDB Import ===');
    const mdbResult = await importService.send({
      method: 'POST',
      path: '/importFromMDB',
      data: { filePath: './test/data/initial-import.mdb' }
    });
    console.log(mdbResult);
    
    // 2. JSON Delta Import
    console.log('\n=== JSON Delta Import ===');
    const jsonResult = await importService.send({
      method: 'POST',
      path: '/importDeltaJSON',
      data: { filePath: './test/data/delta-update.json' }
    });
    console.log(jsonResult);
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testImport();
