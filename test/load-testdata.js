import cds from '@sap/cds'
import fs from 'fs'
import path from 'path'

const testDataDir = path.join(process.cwd(), 'test/data')

await cds.connect.to('db')

// Alle CSV laden
for (const file of fs.readdirSync(testDataDir).filter(f => f.endsWith('.csv'))) {
  const table = file.replace('.csv', '')
  const csv = fs.readFileSync(path.join(testDataDir, file), 'utf8')
  
  // CSV → CDS INSERT
  const rows = csv.split('\n').slice(1).map(line => {
    const values = line.split(',').map(v => `'${v.trim().replace(/'/g, "''")}'`)
    return `(${values.join(',')})`
  }).join(',\n')
  
  await cds.run(`INSERT INTO ${table} VALUES ${rows}`)
}
