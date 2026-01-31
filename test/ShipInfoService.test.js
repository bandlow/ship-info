import cds from '@sap/cds'
console.log('Aktive Profile:', cds.env.profiles);  // ["development"]
console.log('DB Config:', cds.env.requires.db);     // { kind: "sqlite", ... }
console.log('Alle requires:', cds.env.requires);

const { GET, POST, expect, axios } = cds.test (import.meta.dirname+'/..')
axios.defaults.auth = { username: 'alice', password: '' }

describe('ShipInfoService OData APIs', () => {

  it('serves ShipInfoService.tblShip', async () => {
    const { data } = await GET `/odata/v4/ship-info/tblShip ${{ params: { $select: 'LRIMOShipNo,ShipName' } }}`
    expect(data.value).to.containSubset([
      {"LRIMOShipNo":"1000100","ShipName":"JACQUES HEIM"},
    ])
  })

})
