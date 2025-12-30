const cds = require('@sap/cds');
const expect = require('chai').expect;
const { INSERT, SELECT, DELETE } = cds.test(__dirname + '/..');
/** 🔥 MAGIC: cds.test() lädt Model + startet Server! */
  //const testSrv = cds.test(__dirname + '/..');  // test/ → srv/lib/db-import.js

describe('🚢 ShipInfoService Tests', () => {
  
  let db, srv;
  this.skip();
  before(async () => {
    // DB connect
    await cds.connect.to('db');
    db = await cds.connect.to('db');
    
    console.log('🧪 Connected to ship-info.sqlite');
  });

  it('should have 1234 ships', async () => {
    // Direkte SQL Query (kein cds.pretty!)
    const result = await db.run('SELECT COUNT(*) as count FROM skf_zcapn_shipimporter_tblShip');
    expect(result[0].count).to.equal(1234);
  });

  it('should find ship LRNO=9999981', async () => {
    const result = await db.run("SELECT * FROM skf_zcapn_shipimporter_tblShip WHERE LRNO = '9999981'");
    expect(result.length).to.equal(1);
    expect(result[0].LRNO).to.equal('9999981');
    expect(result[0].ShipName).to.exist;
  });

  it('should have AC/DCIndicator values', async () => {
    const acCount = await db.run("SELECT COUNT(*) as count FROM skf_zcapn_shipimporter_tblShip WHERE ACDCIndicator = 'AC'");
    const dcCount = await db.run("SELECT COUNT(*) as count FROM skf_zcapn_shipimporter_tblShip WHERE ACDCIndicator = 'DC'");
    
    expect(acCount[0].count).to.be.greaterThan(0);
    expect(dcCount[0].count).to.be.greaterThan(0);
  });

  it('should have AuxEngines data', async () => {
    const result = await db.run('SELECT COUNT(*) as count FROM skf_zcapn_shipimporter_tblAuxEngines');
    expect(result[0].count).to.equal(100);
  });

  after(async () => {
    await cds.disconnect();
    console.log('✅ Tests completed!');
  });
});
