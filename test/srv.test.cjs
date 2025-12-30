const cds = require('@sap/cds')
const { expect } = cds.utils

// Server MUSS vor describe starten!
const test = cds.test(__dirname + '/..')

describe('srv tests', () => {
  it('srv loads', async () => {
    const srv = await cds.connect.to('srv')
    expect(srv).property('tx').a('function')
  })
})
