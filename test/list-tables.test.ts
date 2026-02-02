// test/list-tables.test.ts
import cds from '@sap/cds';

const LOG = cds.log('list-tables');

async function listTables() {
  try {
    LOG.info('🔍 Starting...');
    LOG.info('');
    
    // ✅ Load service models
    LOG.info('📚 Loading CDS model...');
    try {
      // Load all CDS files
      const csn = await cds.load([
        'db/schema.cds',
        'srv/import-service.cds',
        'srv/ship-info-service.cds'
      ]);
      cds.model = cds.linked(csn);
      
      LOG.info(`   ✓ Model loaded and assigned`);
      LOG.info(`   ✓ cds.model exists: ${!!cds.model}`);
      
      if (cds.model && cds.model.definitions) {
        const definitions = Object.keys(cds.model.definitions);
        const entities = definitions.filter(name => cds.model.definitions[name].kind === 'entity');
        const services = definitions.filter(name => cds.model.definitions[name].kind === 'service');
        
        LOG.info(`   ✓ Total definitions: ${definitions.length}`);
        LOG.info(`   ✓ Entities: ${entities.length}`);
        LOG.info(`   ✓ Services: ${services.length}`);
        LOG.info('');
        
        if (services.length > 0) {
          LOG.info('   Services:');
          services.forEach(name => LOG.info(`      - ${name}`));
          LOG.info('');
        }
        
        if (entities.length > 0) {
          LOG.info('   Sample entities:');
          entities.slice(0, 15).forEach(name => LOG.info(`      - ${name}`));
          if (entities.length > 15) {
            LOG.info(`      ... and ${entities.length - 15} more`);
          }
          LOG.info('');
        }
      }
    } catch (loadError) {
      LOG.error(`   ✗ Failed to load model:`, loadError);
    }
    
    // Connect to database
    LOG.info('🔍 Connecting to database...');
    const db = await cds.connect.to('db');
    LOG.info(`✅ Connected: ${db.kind}`);
    LOG.info('');
    
    if (db.kind === 'sqlite') {
      const dbUrl = (db as any).options?.credentials?.url || cds.env.requires?.db?.credentials?.url;
      LOG.info(`📁 SQLite file: ${dbUrl}`);
      LOG.info('');
      
      // List all shipinfo tables
      const tables = await db.run(`
        SELECT name
        FROM sqlite_master 
        WHERE type='table' 
        AND name LIKE 'shipinfo_tbl%'
        ORDER BY name
      `);
      
      LOG.info(`📊 Found ${tables.length} shipinfo data tables`);
      LOG.info('');
    }
    
    // Now check if entities exist
    if (cds.model && cds.model.definitions) {
      LOG.info('🔗 Checking TABLE_MAPPING:');
      LOG.info('');
      
      const TABLE_MAPPING: Record<string, string> = {
        'tblStatusCodes': 'shipinfo.tblStatusCodes',
        'tblShipTypeCodes': 'shipinfo.tblShipTypeCodes',
        'tblTownCodes': 'shipinfo.tblTownCodes',
        'tblShip': 'shipinfo.tblShip',
      };
      
      for (const [tableName, entityName] of Object.entries(TABLE_MAPPING)) {
        const entityDef = cds.model.definitions[entityName];
        LOG.info(`  ${tableName} → ${entityName}: ${entityDef ? '✓' : '✗'}`);
        
        if (entityDef) {
          const elements = Object.keys(entityDef.elements || {});
          LOG.info(`    Fields: ${elements.length}`);
        }
      }
      LOG.info('');
      
      // Test DELETE and INSERT
      LOG.info('🧪 Testing CDS QL:');
      try {
        const { DELETE, INSERT } = cds.ql;
        LOG.info(`   ✓ DELETE exists: ${typeof DELETE === 'function'}`);
        LOG.info(`   ✓ INSERT exists: ${typeof INSERT === 'function'}`);
        
        // Try to build a query
        const deleteQuery = DELETE.from('shipinfo.tblStatusCodes');
        LOG.info(`   ✓ DELETE.from() works: ${!!deleteQuery}`);
        
        // Try actual delete (but don't execute)
        LOG.info(`   ✓ Query built successfully`);
        
      } catch (qlError) {
        LOG.error(`   ✗ CDS QL error:`, qlError);
      }
      LOG.info('');
    }
    
  } catch (error) {
    LOG.error('❌ Error:', error);
    throw error;
  }
}

// Run
listTables().then(() => {
  LOG.info('✅ Done');
  process.exit(0);
}).catch((error) => {
  LOG.error('💥 Failed:', error);
  process.exit(1);
});
