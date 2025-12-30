const cds = require('@sap/cds');

describe('Sample test', () => {
  const test = cds.test(__dirname + '/..');  // Launches from project root [page:0]
  
  it('should work', () => {
    expect(1).to.equal(1);
  });
});
