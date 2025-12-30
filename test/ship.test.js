import cds from '@sap/cds'
import { expect } from 'chai'

const { GET, POST } = cds.test('..')  // <- RELATIVER Pfad!

describe('srv tests', () => {
  it('db connects', async () => {
    const db = await cds.connect.to('db')
    expect(db.tx).to.be.a('function')
  })
})
