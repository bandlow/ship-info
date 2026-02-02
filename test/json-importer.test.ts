// test/json-importer.test.ts
import cds from '@sap/cds';
import { JSONImporter } from '../srv/importers/json-importer.js';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

// ✅ ES Module __dirname replacement
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const LOG = cds.log('json-importer-test');

/**
 * ✅ Test Suite für JSON Importer
 */
class JSONImporterTest {
  private testDir: string;
  
  constructor() {
    this.testDir = join(process.cwd(), 'downloads', 'delta-update');
  }
  
  /**
   * Setup: Initialize CDS and validate test directory
   */
  async setup(): Promise<void> {
    LOG.info('');
    LOG.info('🔧 Setup: Initializing test environment...');
    
    // Connect to database
    try {
      await cds.connect.to('db');
      LOG.info('✅ Database connected');
    } catch (error: any) {
      LOG.error(`❌ Database connection failed: ${error.message}`);
      throw error;
    }
    
    // Check test directory
    if (!existsSync(this.testDir)) {
      LOG.warn(`⚠️  Test directory not found: ${this.testDir}`);
      LOG.info('   Creating directory...');
      throw new Error(`Test directory does not exist: ${this.testDir}`);
    }
    
    // List JSON files
    const files = readdirSync(this.testDir).filter(f => f.endsWith('.json'));
    LOG.info(`📂 Found ${files.length} JSON file(s) in ${this.testDir}`);
    
    if (files.length === 0) {
      LOG.warn('⚠️  No JSON files found for testing');
      throw new Error('No JSON files found in test directory');
    }
    
    // Show file details
    for (const file of files) {
      const filePath = join(this.testDir, file);
      const stats = statSync(filePath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      LOG.info(`   - ${file} (${sizeMB} MB)`);
    }
    
    LOG.info('✅ Setup completed');
  }
  
  /**
   * Test 1: Import with Replace Mode
   */
  async testImportReplace(): Promise<boolean> {
    LOG.info('');
    LOG.info('📦 Test 1: Import with Replace Mode');
    LOG.info('─'.repeat(60));
    
    try {
      LOG.info('   Mode: replace (delete old data, insert new)');
      
      const importer = new JSONImporter();
      
      const result = await importer.importAll(this.testDir, {
        mode: 'replace'
      });
      
      LOG.info('');
      LOG.info(`✅ Import completed`);
      LOG.info(`   Success: ${result.success}`);
      LOG.info(`   Duration: ${(result.duration / 1000).toFixed(2)}s`);
      LOG.info(`   Files: ${Object.keys(result.stats).length}`);
      LOG.info(`   Message: ${result.message}`);
      
      // Show detailed stats
      LOG.info('');
      LOG.info('📊 Detailed Statistics:');
      let totalRows = 0;
      for (const [table, stats] of Object.entries(result.stats)) {
        const speed = Math.round(stats.rows / (stats.duration / 1000));
        const status = stats.error ? '❌' : '✅';
        LOG.info(`   ${status} ${table}: ${stats.rows.toLocaleString()} rows in ${(stats.duration / 1000).toFixed(1)}s (${speed} rows/s)`);
        if (stats.error) {
          LOG.error(`      Error: ${stats.error}`);
        }
        totalRows += stats.rows;
      }
      
      LOG.info('');
      LOG.info(`📈 Total: ${totalRows.toLocaleString()} rows imported`);
      
      return result.success;
      
    } catch (error: any) {
      LOG.error(`❌ Test failed: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Test 2: Import with Upsert Mode
   */
  async testImportUpsert(): Promise<boolean> {
    LOG.info('');
    LOG.info('🔄 Test 2: Import with Upsert Mode');
    LOG.info('─'.repeat(60));
    
    try {
      LOG.info('   Mode: upsert (update existing or insert new)');
      
      const importer = new JSONImporter();
      
      const result = await importer.importAll(this.testDir, {
        mode: 'upsert',
        batchSize: 5000
      });
      
      LOG.info('');
      LOG.info(`✅ Import completed`);
      LOG.info(`   Success: ${result.success}`);
      LOG.info(`   Duration: ${(result.duration / 1000).toFixed(2)}s`);
      LOG.info(`   Files: ${Object.keys(result.stats).length}`);
      
      // Show stats summary
      LOG.info('');
      LOG.info('📊 Summary:');
      let totalRows = 0;
      for (const stats of Object.values(result.stats)) {
        totalRows += stats.rows;
      }
      LOG.info(`   Total rows: ${totalRows.toLocaleString()}`);
      
      return result.success;
      
    } catch (error: any) {
      LOG.error(`❌ Test failed: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Test 3: Import with Custom Batch Size
   */
  async testImportCustomBatch(): Promise<boolean> {
    LOG.info('');
    LOG.info('⚙️  Test 3: Import with Custom Batch Size');
    LOG.info('─'.repeat(60));
    
    try {
      LOG.info('   Batch size: 1000 rows');
      
      const importer = new JSONImporter();
      
      const startTime = Date.now();
      
      const result = await importer.importAll(this.testDir, {
        mode: 'replace',
        batchSize: 1000
      });
      
      const duration = Date.now() - startTime;
      
      LOG.info('');
      LOG.info(`✅ Import completed`);
      LOG.info(`   Duration: ${(duration / 1000).toFixed(2)}s`);
      LOG.info(`   Files processed: ${Object.keys(result.stats).length}`);
      
      return result.success;
      
    } catch (error: any) {
      LOG.error(`❌ Test failed: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Test 4: Verify Data in Database
   */
  async testVerifyData(): Promise<boolean> {
    LOG.info('');
    LOG.info('🔍 Test 4: Verify Imported Data');
    LOG.info('─'.repeat(60));
    
    try {
      const db = await cds.connect.to('db');
      
      // Check some common entities (using correct namespace)
      const entitiesToCheck = [
        'shipinfo.tblShip',
        'shipinfo.tblShipType',
        'shipinfo.tblOwner',
        'shipinfo.tblBuilder',
        'shipinfo.tblMainEngines',
        'shipinfo.tblAuxEngines'
      ];
      
      LOG.info('   Checking entity counts...');
      LOG.info('');
      
      let allValid = true;
      
      for (const entity of entitiesToCheck) {
        try {
          const result = await db.run(`SELECT COUNT(*) as count FROM ${entity}`);
          const count = result[0]?.count || 0;
          
          if (count > 0) {
            LOG.info(`   ✅ ${entity}: ${count.toLocaleString()} records`);
          } else {
            LOG.warn(`   ⚠️  ${entity}: 0 records (might be empty)`);
          }
        } catch (err) {
          LOG.error(`   ❌ ${entity}: Query failed - ${err instanceof Error ? err.message : 'unknown'}`);
          allValid = false;
        }
      }
      
      LOG.info('');
      LOG.info(`✅ Data verification ${allValid ? 'passed' : 'completed with warnings'}`);
      
      return allValid;
      
    } catch (error: any) {
      LOG.error(`❌ Test failed: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Test 5: Error Handling
   */
  async testErrorHandling(): Promise<boolean> {
    LOG.info('');
    LOG.info('⚠️  Test 5: Error Handling');
    LOG.info('─'.repeat(60));
    
    try {
      const importer = new JSONImporter();
      
      // Test 1: Non-existent directory
      LOG.info('   Testing non-existent directory...');
      try {
        await importer.importAll('/non/existent/path');
        LOG.warn('   ⚠️  Should have thrown error for invalid path');
        return false;
      } catch (error: any) {
        LOG.info('   ✓ Invalid path handled correctly');
      }
      
      LOG.info('');
      LOG.info(`✅ Error handling tests passed`);
      return true;
      
    } catch (error: any) {
      LOG.error(`❌ Test failed: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Test 6: Performance Benchmark
   */
  async testPerformance(): Promise<boolean> {
    LOG.info('');
    LOG.info('⚡ Test 6: Performance Benchmark');
    LOG.info('─'.repeat(60));
    
    try {
      const importer = new JSONImporter();
      
      // Test different batch sizes
      const batchSizes = [1000, 5000, 10000];
      const results: { batchSize: number; duration: number; rowsPerSec: number }[] = [];
      
      for (const batchSize of batchSizes) {
        LOG.info(`   Testing batch size: ${batchSize}`);
        
        const startTime = Date.now();
        
        const result = await importer.importAll(this.testDir, {
          mode: 'replace',
          batchSize
        });
        
        const duration = Date.now() - startTime;
        const totalRows = Object.values(result.stats).reduce((sum, stat) => sum + stat.rows, 0);
        const rowsPerSec = Math.round(totalRows / (duration / 1000));
        
        results.push({ batchSize, duration, rowsPerSec });
        
        LOG.info(`   ✓ Completed in ${(duration / 1000).toFixed(2)}s (${rowsPerSec} rows/s)`);
      }
      
      // Show comparison
      LOG.info('');
      LOG.info('📊 Performance Comparison:');
      for (const result of results) {
        LOG.info(`   Batch ${result.batchSize.toLocaleString()}: ${(result.duration / 1000).toFixed(2)}s (${result.rowsPerSec.toLocaleString()} rows/s)`);
      }
      
      // Find best
      const best = results.reduce((prev, curr) => curr.rowsPerSec > prev.rowsPerSec ? curr : prev);
      LOG.info('');
      LOG.info(`🏆 Best performance: Batch size ${best.batchSize.toLocaleString()} (${best.rowsPerSec.toLocaleString()} rows/s)`);
      
      return true;
      
    } catch (error: any) {
      LOG.error(`❌ Test failed: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Run all tests
   */
  async runAllTests(options: {
    quick?: boolean;
    skipPerformance?: boolean;
  } = {}): Promise<void> {
    LOG.info('');
    LOG.info('╔════════════════════════════════════════════════════════════╗');
    LOG.info('║            JSON IMPORTER TEST SUITE                        ║');
    LOG.info('╚════════════════════════════════════════════════════════════╝');
    
    await this.setup();
    
    const results: { [key: string]: boolean } = {};
    
    // Test 1: Replace Mode
    results['Import Replace Mode'] = await this.testImportReplace();
    
    if (!options.quick) {
      // Test 2: Upsert Mode
      results['Import Upsert Mode'] = await this.testImportUpsert();
      
      // Test 3: Custom Batch Size
      results['Custom Batch Size'] = await this.testImportCustomBatch();
    }
    
    // Test 4: Verify Data
    results['Verify Data'] = await this.testVerifyData();
    
    // Test 5: Error Handling
    results['Error Handling'] = await this.testErrorHandling();
    
    // Test 6: Performance (optional)
    if (!options.skipPerformance && !options.quick) {
      results['Performance Benchmark'] = await this.testPerformance();
    }
    
    // Summary
    LOG.info('');
    LOG.info('╔════════════════════════════════════════════════════════════╗');
    LOG.info('║                      TEST SUMMARY                          ║');
    LOG.info('╚════════════════════════════════════════════════════════════╝');
    
    let passed = 0;
    let failed = 0;
    
    Object.entries(results).forEach(([name, success]) => {
      const status = success ? '✅ PASS' : '❌ FAIL';
      LOG.info(`   ${status} - ${name}`);
      if (success) passed++; else failed++;
    });
    
    LOG.info('');
    LOG.info('─'.repeat(60));
    LOG.info(`   Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
    LOG.info('─'.repeat(60));
    LOG.info('');
  }
}

/**
 * ✅ Main Test Runner
 */
async function main() {
  const args = process.argv.slice(2);
  const quick = args.includes('--quick');
  const skipPerformance = args.includes('--skip-performance');
  const customDir = args.find(a => a.startsWith('--dir='))?.split('=')[1];
  
  LOG.info('');
  LOG.info('🧪 JSON Importer Test Runner');
  LOG.info('─'.repeat(60));
  
  if (quick) {
    LOG.info('⚡ Quick mode enabled (skipping some tests)');
  }
  
  if (customDir) {
    LOG.info(`📂 Using custom directory: ${customDir}`);
  }
  
  try {
    const tester = new JSONImporterTest();
    
    // Override test directory if custom provided
    if (customDir) {
      (tester as any).testDir = customDir;
    }
    
    await tester.runAllTests({
      quick,
      skipPerformance
    });
    
  } catch (error: any) {
    LOG.error('');
    LOG.error(`❌ Test initialization failed: ${error.message}`);
    process.exit(1);
  }
}

// ✅ ES Module entry point check
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch(error => {
    LOG.error('Fatal error:', error);
    process.exit(1);
  });
}

export { JSONImporterTest };
