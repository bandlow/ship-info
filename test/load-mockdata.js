import cds from '@sap/cds'
import fs from 'fs'
import path from 'path'

await cds.connect.to('db')  // CAP DB verbinden

const testDataDir = path.join(process.cwd(), 'test/data')

for (const file of fs.readdirSync(testDataDir)) {
  if (file.endsWith('.csv')) {
    const csv = fs.readFileSync(path.join(testDataDir, file), 'utf8')
    const tableName = file.replace('.csv', '')
    
    const rows = csv
      .trim()
      .split('\n')
      .slice(1)
      .filter(line => line.trim())
      .map(line => {
        const values = line.split(',').map(v => `'${v.trim().replace(/'/g, "''")}'`)
        return `(${values.join(',')})`  // ✅ Klammern um VALUES
      })
      .join(',\n')
    
    if (rows) {
      // ✅ cds.run mit INSERT INTO (table) VALUES (...)
      await cds.run(`INSERT INTO "${tableName}" VALUES ${rows}`)
      console.log(`✅ ${tableName}: ${rows.split('\n').length} rows`)
    }
  }
}

console.log('🎉 All test data loaded!')
