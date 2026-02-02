// srv/importers/import-manager.ts
import cds from '@sap/cds';
import { MDBBatchImporter } from './mdb-batch-importer.js';
import { JSONImporter } from './json-importer.js';
import { SftpDownloader, type SftpConfig } from '../services/sftp-downloader.js';
import { existsSync, readdirSync, statSync, rmSync } from 'fs';
import { join, basename, resolve } from 'path';

const LOG = cds.log('import-manager');

export interface ImportPlan {
  type: 'FULL' | 'DELTA';
  files: Array<{
    path: string;
    version: string;
    date: Date;
  }>;
}

export interface SmartImportOptions {
  downloadDir?: string;
  sftpConfig?: SftpConfig;
  downloadLatest?: boolean;
  cleanup?: boolean;
}

export class ImportManager {
  private db: any;
  
  /**
   * ✅ Haupteinstiegspunkt: Intelligenter Import mit optionalem SFTP-Download
   */
  async smartImport(
    importDir?: string, 
    options: SmartImportOptions = {}
  ): Promise<void> {
    LOG.info('🎯 Starting Smart Import Manager');
    LOG.info('');
    
    // Load CDS model
    if (!cds.model) {
      LOG.info('📚 Loading CDS model...');
      const csn = await cds.load([
        'db/schema.cds',
        'srv/import-service.cds',
        'srv/ship-info-service.cds'
      ]);
      cds.model = cds.linked(csn);
    }
    
    this.db = await cds.connect.to('db');
    
    // Prüfe aktuellen DB-Stand
    const currentVersion = await this.getCurrentVersion();
    LOG.info(`📊 Current Database Version: ${currentVersion || 'EMPTY'}`);
    LOG.info('');
    
    // ✅ Download von SFTP falls konfiguriert
    let workingDir = importDir;
    
    if (options.sftpConfig && options.downloadLatest) {
      workingDir = await this.downloadFromSftp(
        options.sftpConfig, 
        options.downloadDir || '/downloads',
        currentVersion
      );
    }
    
    if (!workingDir) {
      throw new Error('No import directory specified and no SFTP download configured');
    }
    
    LOG.info(`   Working Directory: ${workingDir}`);
    LOG.info('');
    
    // Analysiere verfügbare Dateien
    const plan = await this.analyzeImportFiles(workingDir, currentVersion);
    
    if (!plan) {
      LOG.info('✅ Database is up to date - no import needed');
      
      // Cleanup falls gewünscht
      if (options.cleanup && options.sftpConfig) {
        this.cleanupDownloads(workingDir);
      }
      
      return;
    }
    
    LOG.info(`📋 Import Plan:`);
    LOG.info(`   Type: ${plan.type}`);
    LOG.info(`   Files: ${plan.files.length}`);
    LOG.info('');
    
    // Führe Import durch
    if (plan.type === 'FULL') {
      await this.performFullImport(plan.files[0]);
    } else {
      await this.performDeltaImports(plan.files);
    }
    
    // Cleanup falls gewünscht
    if (options.cleanup && options.sftpConfig) {
      this.cleanupDownloads(workingDir);
    }
    
    LOG.info('');
    LOG.info('✅ Smart Import completed successfully');
  }
  
  /**
   * ✅ Download von SFTP
   */
  private async downloadFromSftp(
    sftpConfig: SftpConfig,
    downloadDir: string,
    currentVersion: string | null
  ): Promise<string> {
    LOG.info('📡 SFTP Download');
    LOG.info('═══════════════════════════════════════════════════════════');
    LOG.info(`   Host: ${sftpConfig.host}:${sftpConfig.port}`);
    LOG.info(`   User: ${sftpConfig.username}`);
    LOG.info('');
    
    const downloader = new SftpDownloader(sftpConfig);
    
    try {
      // Prüfe ob Full Import verfügbar ist
      LOG.info('🔍 Checking for full import...');
      const availableFiles = await downloader.listFiles('/');
      const fullImports = availableFiles
        .filter(f => f.name.match(/^ShipData_\d{8}\.zip$/))
        .sort((a, b) => b.name.localeCompare(a.name));
      
      if (fullImports.length > 0) {
        const latestFull = fullImports[0];
        const latestVersion = this.extractVersion(latestFull.name);
        
        LOG.info(`   Latest Full: ${latestFull.name} (version: ${latestVersion})`);
        
        // Wenn Full Import neuer als DB → download
        if (!currentVersion || latestVersion > currentVersion) {
          LOG.info(`   → Full import needed (${latestVersion} > ${currentVersion || 'EMPTY'})`);
          LOG.info('');
          
          const fullDir = resolve(downloadDir, 'full');
          await downloader.downloadFullImport(fullDir);
          
          return fullDir;
        }
      }
      
      // Sonst: Prüfe Delta Updates
      LOG.info('');
      LOG.info('🔍 Checking for delta updates...');
      
      if (!currentVersion) {
        LOG.warn('   ⚠️  No current version - cannot download deltas without baseline');
        throw new Error('Database is empty - full import required');
      }
      
      // Hole alle fehlenden Deltas
      const today = this.formatDate(new Date());
      const missingDeltas = await downloader.getAvailableDeltaUpdates(
        currentVersion,
        today
      );
      
      if (missingDeltas.length === 0) {
        LOG.info('   ✅ No new delta updates available');
        return downloadDir;
      }
      
      LOG.info(`   Found ${missingDeltas.length} missing delta(s)`);
      LOG.info('');
      
      // Download alle fehlenden Deltas
      const deltaDir = resolve(downloadDir, 'deltas');
      
      for (const deltaFile of missingDeltas) {
        const dateMatch = deltaFile.match(/ShipData_(\d{8})_Update/);
        const date = dateMatch ? dateMatch[1] : undefined;
        
        if (date) {
          LOG.info(`📥 Downloading: ${deltaFile}`);
          await downloader.downloadDeltaUpdate(deltaDir, date);
        }
      }
      
      return deltaDir;
      
    } catch (error) {
      LOG.error('❌ SFTP download failed:', error);
      throw error;
    }
  }
  
  /**
   * ✅ Cleanup Downloads
   */
  private cleanupDownloads(dir: string): void {
    try {
      LOG.info('');
      LOG.info('🗑️  Cleaning up downloads...');
      
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
        LOG.info('   ✅ Cleanup completed');
      }
    } catch (error) {
      LOG.warn('   ⚠️  Cleanup failed:', error);
    }
  }
  
  /**
   * ✅ Format Date to YYYYMMDD
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }
  
  /**
   * ✅ Hole aktuellen Datenbank-Stand
   */
  private async getCurrentVersion(): Promise<string | null> {
    try {
      const result = await this.db.run(`
        SELECT dataVersion 
        FROM shipinfo_importInfo 
        WHERE status = 'SUCCESS' 
        ORDER BY importDate DESC 
        LIMIT 1
      `);
      
      return result.length > 0 ? result[0].dataVersion : null;
    } catch (error) {
      LOG.warn('⚠️  Could not read current version - assuming empty database');
      return null;
    }
  }
  
  /**
   * ✅ Analysiere verfügbare Import-Dateien
   */
  private async analyzeImportFiles(
    importDir: string, 
    currentVersion: string | null
  ): Promise<ImportPlan | null> {
    if (!existsSync(importDir)) {
      throw new Error(`Import directory not found: ${importDir}`);
    }
    
    const files = readdirSync(importDir);
    
    // Suche nach MDB-Dateien (Vollimport)
    const mdbFiles = files
      .filter(f => f.toLowerCase().endsWith('.mdb'))
      .map(f => ({
        path: join(importDir, f),
        version: this.extractVersion(f),
        date: this.extractDate(f)
      }))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
    
    // Suche nach JSON-Dateien (Delta-Updates)
    const jsonDirs = files
      .filter(f => {
        const fullPath = join(importDir, f);
        return existsSync(fullPath) && statSync(fullPath).isDirectory();
      })
      .map(f => ({
        path: join(importDir, f),
        version: this.extractVersion(f),
        date: this.extractDate(f)
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    
    LOG.info(`📁 Found Import Files:`);
    LOG.info(`   MDB Files (Full): ${mdbFiles.length}`);
    LOG.info(`   JSON Directories (Delta): ${jsonDirs.length}`);
    LOG.info('');
    
    // Entscheidungslogik
    if (mdbFiles.length > 0) {
      const latestMdb = mdbFiles[0];
      
      // Wenn MDB neuer als aktueller Stand → Vollimport
      if (!currentVersion || latestMdb.version > currentVersion) {
        LOG.info(`🔄 Full import needed: MDB ${latestMdb.version} > DB ${currentVersion || 'EMPTY'}`);
        return {
          type: 'FULL',
          files: [latestMdb]
        };
      }
    }
    
    // Finde fehlende Delta-Updates
    const missingDeltas = jsonDirs.filter(f => 
      !currentVersion || f.version > currentVersion
    );
    
    if (missingDeltas.length > 0) {
      LOG.info(`📦 ${missingDeltas.length} delta update(s) needed`);
      return {
        type: 'DELTA',
        files: missingDeltas
      };
    }
    
    return null;
  }
  
  /**
   * ✅ Extrahiere Versions-String aus Dateinamen
   */
  private extractVersion(filename: string): string {
    // Beispiele:
    // - ShipData_20260202.mdb → 20260202
    // - ShipData_20260202_Update.zip → 20260202
    // - 20260202 (directory name)
    
    const match = filename.match(/(\d{8})/);
    if (match) {
      return match[1];
    }
    
    return basename(filename);
  }
  
  /**
   * ✅ Extrahiere Datum aus Dateinamen
   */
  private extractDate(filename: string): Date {
    const match = filename.match(/(\d{4})(\d{2})(\d{2})/);
    if (match) {
      const [_, year, month, day] = match;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    
    // Fallback: File modification time
    try {
      const stats = statSync(filename);
      return stats.mtime;
    } catch {
      return new Date();
    }
  }
  
  /**
   * ✅ Führe Vollimport aus MDB durch
   */
  private async performFullImport(file: { path: string; version: string }): Promise<void> {
    LOG.info('');
    LOG.info('═══════════════════════════════════════════════════════════');
    LOG.info('  FULL IMPORT FROM MDB');
    LOG.info('═══════════════════════════════════════════════════════════');
    LOG.info(`   File: ${basename(file.path)}`);
    LOG.info(`   Version: ${file.version}`);
    LOG.info('');
    
    const startTime = Date.now();
    const importId = await this.logImportStart('FULL', file.path, file.version);
    
    try {
      // Führe MDB-Import durch
      const importer = new MDBBatchImporter();
      const result = await importer.importAll(file.path);
      
      // Berechne Gesamt-Anzahl
      const totalRecords = result.stats 
        ? Object.values(result.stats).reduce((sum, stat) => sum + stat.rows, 0)
        : 0;
      
      // Update Import-Log
      await this.logImportComplete(
        importId,
        'SUCCESS',
        totalRecords,
        Date.now() - startTime
      );
      
      // Update Entity-Status
      await this.updateEntityStatus('FULL', file.version);
      
      LOG.info('');
      LOG.info(`✅ Full import completed: ${totalRecords.toLocaleString()} rows`);
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.logImportComplete(importId, 'FAILED', 0, Date.now() - startTime, errorMsg);
      throw error;
    }
  }
  
  /**
   * ✅ Führe Delta-Updates durch
   */
  private async performDeltaImports(
    files: Array<{ path: string; version: string }>
  ): Promise<void> {
    LOG.info('');
    LOG.info('═══════════════════════════════════════════════════════════');
    LOG.info('  DELTA IMPORT');
    LOG.info('═══════════════════════════════════════════════════════════');
    LOG.info(`   Updates: ${files.length}`);
    LOG.info('');
    
    for (const file of files) {
      await this.performSingleDeltaImport(file);
    }
  }
  
  /**
   * ✅ Führe einzelnes Delta-Update durch
   */
  private async performSingleDeltaImport(
    file: { path: string; version: string }
  ): Promise<void> {
    LOG.info(`📦 Processing: ${basename(file.path)} (${file.version})`);
    
    const startTime = Date.now();
    const importId = await this.logImportStart('DELTA', file.path, file.version);
    
    try {
      // Führe JSON-Import durch
      const importer = new JSONImporter();
      const result = await importer.importAll(file.path, { mode: 'upsert' });
      
      // Berechne Gesamt-Anzahl
      const totalRecords = result.stats
        ? Object.values(result.stats).reduce((sum, stat) => sum + stat.rows, 0)
        : 0;
      
      // Update Import-Log
      await this.logImportComplete(
        importId,
        'SUCCESS',
        totalRecords,
        Date.now() - startTime
      );
      
      // Update Entity-Status
      await this.updateEntityStatus('DELTA', file.version);
      
      LOG.info(`   ✅ Completed: ${totalRecords.toLocaleString()} rows`);
      LOG.info('');
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.logImportComplete(importId, 'FAILED', 0, Date.now() - startTime, errorMsg);
      LOG.error(`   ❌ Failed: ${errorMsg}`);
      throw error;
    }
  }
  
  /**
   * ✅ Log Import-Start
   */
  private async logImportStart(
    type: string,
    source: string,
    version: string
  ): Promise<string> {
    const { INSERT } = cds.ql;
    
    const result = await this.db.run(
      INSERT.into('shipinfo.ImportInfo').entries({
        importType: type,
        importSource: basename(source),
        importDate: new Date().toISOString(),
        dataVersion: version,
        status: 'IN_PROGRESS'
      })
    );
    
    return result.lastID || result.ID;
  }
  
  /**
   * ✅ Log Import-Completion
   */
  private async logImportComplete(
    id: string,
    status: string,
    records: number,
    duration: number,
    error?: string
  ): Promise<void> {
    await this.db.run(`
      UPDATE shipinfo_importInfo 
      SET status = ?, 
          recordsImported = ?, 
          duration = ?,
          errorMessage = ?
      WHERE ID = ?
    `, [status, records, Math.round(duration / 1000), error || null, id]);
  }
  
  /**
   * ✅ Update Entity-Status
   */
  private async updateEntityStatus(type: string, version: string): Promise<void> {
    const now = new Date().toISOString();
    
    if (type === 'FULL') {
      await this.db.run(`
        INSERT OR REPLACE INTO shipinfo_entityUpdateStatus (
          entityName, lastFullImport, lastDataVersion, updatedAt
        ) VALUES ('ALL', ?, ?, ?)
      `, [now, version, now]);
    } else {
      await this.db.run(`
        INSERT OR REPLACE INTO shipinfo_entityUpdateStatus (
          entityName, lastDeltaImport, lastDataVersion, updatedAt
        ) VALUES ('ALL', ?, ?, ?)
      `, [now, version, now]);
    }
  }
}
