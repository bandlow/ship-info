// test/load-mockdata.js
import cds from '@sap/cds'
import fs from 'fs'
import path from 'path'

await cds.connect.to('db')

const testDataDir = path.join(process.cwd(), 'test/data')

for (const file of fs.readdirSync(testDataDir)) {
  if (file.endsWith('.csv')) {
    const csv = fs.readFileSync(path.join(testDataDir, file), 'utf8')
    const mdbTableName = file.replace('.csv', '')  // "tblAuxEngines"
    
    // ✅ CAP Namespace-Tabelle finden
    const capTableName = `skf_zcapn_shipimporter_${mdbTableName}`
    
    const rows = csv
      .trim()
      .split('\n')
      .slice(1)
      .filter(line => line.trim())
      .map(line => {
        const values = line.split(',').map(v => `'${v.trim().replace(/'/g, "''")}'`)
        return `(${values.join(',')})`
      })
      .join(',\n')
    
    if (rows) {
      // ✅ Korrekte CAP-Tabelle!
      await cds.run(`INSERT INTO "${capTableName}" VALUES ${rows}`)
      console.log(`✅ ${capTableName}: ${rows.split('\n').length} rows`)
    }
  }
}