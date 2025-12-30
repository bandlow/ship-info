import cds from '@sap/cds'

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
