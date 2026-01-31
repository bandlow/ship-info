// test/load-mockdata.js - CAP In-Memory Testdata Loader
import cds from '@sap/cds'
import fs from 'fs'
import path from 'path'

console.log('🚀 Starting test data load...')

// ✅ CAP DB connect (nach cds deploy)
await cds.connect.to('db')

// ✅ CAP Tables auflisten
const tables = await cds.run(`
  SELECT name FROM sqlite_master 
  WHERE type='table' AND name NOT LIKE 'sqlite_%'
`)
console.log('📋 CAP Tables found:', tables.map(t => t.name))

const testDataDir = path.join(process.cwd(), 'test/data')

if (!fs.existsSync(testDataDir)) {
  console.error(`❌ test/data directory not found: ${testDataDir}`)
  process.exit(1)
}

let loaded = 0
const files = fs.readdirSync(testDataDir).filter(f => f.endsWith('.csv'))

for (const file of files) {
  const mdbTableName = file.replace('.csv', '')
  
  // ✅ Dynamisches CAP Table Matching
  const capTable = tables.find(t => 
    t.name.includes(mdbTableName) || 
    t.name.endsWith(`_${mdbTableName}`)
  )
  
  if (!capTable) {
    console.warn(`⚠️  Skip ${file} - no matching CAP table for ${mdbTableName}`)
    continue
  }
  
  const csvPath = path.join(testDataDir, file)
  const csv = fs.readFileSync(csvPath, 'utf8')
  
  const rows = csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .filter(line => line.trim().length > 0)
    .map(line => {
      const values = line.split(',').map(v => `'${v.trim().replace(/'/g, "''")}'`)
      return `(${values.join(',')})`
    })
    .join(',\n')
  
  if (rows) {
    await cds.run(`INSERT INTO "${capTable.name}" VALUES ${rows}`)
    console.log(`✅ ${capTable.name}: ${rows.split('\n').length} rows`)
    loaded++
  }
}

console.log(`🎉 Loaded ${loaded}/${files.length} tables successfully!`)
