// test/load-mockdata.js
import cds from '@sap/cds'
import fs from 'fs'
import path from 'path'

await cds.connect.to('db')

// ✅ CAP Tables nach Deploy auflisten
const tables = await cds.run(`
  SELECT name FROM sqlite_master 
  WHERE type='table' AND name NOT LIKE 'sqlite_%'
`)
console.log('📋 CAP Tables:', tables.map(t => t.name).join('\n') || '❌ Keine Tabellen!')

const testDataDir = path.join(process.cwd(), 'test/data')
let loaded = 0

for (const file of fs.readdirSync(testDataDir)) {
  if (file.endsWith('.csv')) {
    const mdbTableName = file.replace('.csv', '')
    
    // ✅ Dynamisch: Finde passende CAP Tabelle
    const capTableName = tables.find(t => 
      t.name.includes(mdbTableName) || 
      t.name.endsWith('_' + mdbTableName)
    )?.name
    
    if (!capTableName) {
      console.warn(`⚠️  Keine CAP Tabelle für ${mdbTableName} - skip`)
      continue
    }
    
    const csv = fs.readFileSync(path.join(testDataDir, file), 'utf8')
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
      await cds.run(`INSERT INTO "${capTableName}" VALUES ${rows}`)
      console.log(`✅ ${capTableName}: ${rows.split('\n').length} rows`)
      loaded++
    }
  }
}

console.log(`🎉 ${loaded} Tabellen geladen!`)
