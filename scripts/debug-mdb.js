const mdb = require('@el3um4s/node-mdb');
const path = require('path');

const mdbPath = path.join(__dirname, '../ShipData.mdb');
console.log('📂 MDB Path:', mdbPath);

// **DEBUG: Vollständige API anzeigen**
console.log('=== node-mdb DEBUG ===');
console.log('mdb:', typeof mdb);
console.log('mdb.keys:', Object.keys(mdb));
console.log('mdb.exports:', mdb.exports ? Object.keys(mdb.exports) : 'NO exports');
console.log('mdb.open:', typeof mdb.open);
console.log('mdb.Database:', typeof mdb.Database);
console.log('mdb.default:', mdb.default ? Object.keys(mdb.default) : 'no default');

// Teste Öffnen-Versuche
try {
  console.log('\n🔄 Test 1: mdb.open()');
  mdb.open && mdb.open(mdbPath, (err) => console.log('Test1:', err || 'OK'));
} catch(e) { console.log('Test1 fail:', e.message); }

try {
  console.log('🔄 Test 2: new mdb.Database()');
  const db = new mdb.Database(mdbPath);
  console.log('Test2 OK');
} catch(e) { console.log('Test2 fail:', e.message); }
