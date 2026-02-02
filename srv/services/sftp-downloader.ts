// srv/services/sftp-downloader.ts
import SftpClient from 'ssh2-sftp-client';
import { Client as SSH2Client } from 'ssh2';
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync, chmodSync, createWriteStream } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import unzipper from 'unzipper';
import cds from '@sap/cds';

const execAsync = promisify(exec);
const LOG = cds.log('sftp-downloader');

export type ImportType = 'full' | 'delta';

export interface SftpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  remotePath: string;
}

export interface ExtractedData {
  type: ImportType;
  format: 'mdb' | 'json';
  files: string[];
  primaryFile?: string;
  date?: string;
}

export class SftpDownloader {
  private client: SftpClient;
  private connected: boolean = false;
  
  constructor(private config: SftpConfig) {
    this.client = new SftpClient();
  }
  
  async downloadFullImport(localDir: string, date?: string): Promise<ExtractedData> {
    let remotePath: string;
    
    if (date) {
      remotePath = `/ShipData_${date}.zip`;
    } else {
      LOG.info('🔍 Searching for latest full import...');
      const files = await this.listFiles('/');
      
      const fullImports = files
        .filter(f => f.name.match(/^ShipData_\d{8}\.zip$/))
        .sort((a, b) => b.name.localeCompare(a.name));
      
      if (fullImports.length === 0) {
        throw new Error('No full import files found');
      }
      
      remotePath = `/${fullImports[0].name}`;
      LOG.info(`   Latest: ${fullImports[0].name} (${(fullImports[0].size / 1024 / 1024).toFixed(2)} MB)`);
    }
    
    const dateMatch = remotePath.match(/ShipData_(\d{8})/);
    const importDate = dateMatch ? dateMatch[1] : undefined;
    
    const result = await this.downloadAndExtractNativeScp(localDir, remotePath);
    
    return {
      ...result,
      type: 'full',
      date: importDate
    };
  }
  
  async downloadDeltaUpdate(localDir: string, date?: string): Promise<ExtractedData> {
    let remotePath: string;
    
    if (date) {
      remotePath = `/json/ShipData_${date}_Update.zip`;
    } else {
      LOG.info('🔍 Searching for latest delta update...');
      const files = await this.listFiles('/json');
      
      const deltaUpdates = files
        .filter(f => f.name.match(/^ShipData_\d{8}_Update\.zip$/))
        .sort((a, b) => b.name.localeCompare(a.name));
      
      if (deltaUpdates.length === 0) {
        throw new Error('No delta update files found');
      }
      
      remotePath = `/json/${deltaUpdates[0].name}`;
      LOG.info(`   Latest: ${deltaUpdates[0].name} (${(deltaUpdates[0].size / 1024 / 1024).toFixed(2)} MB)`);
    }
    
    const dateMatch = remotePath.match(/ShipData_(\d{8})_Update/);
    const importDate = dateMatch ? dateMatch[1] : undefined;
    
    const result = await this.downloadAndExtractNativeScp(localDir, remotePath);
    
    return {
      ...result,
      type: 'delta',
      date: importDate
    };
  }
  
  /**
   * ✅ Native SCP Download & Extract
   */
  private async downloadAndExtractNativeScp(
    localDir: string, 
    remotePath: string
  ): Promise<Omit<ExtractedData, 'type' | 'date'>> {
    const fileName = remotePath.split('/').pop() || 'download.zip';
    const zipPath = join(localDir, fileName);
    
    if (!existsSync(localDir)) {
      mkdirSync(localDir, { recursive: true });
    }
    
    // ✅ Download - versuche alle Methoden
    LOG.info(`📥 Downloading via native SCP: ${remotePath}`);
    await this.downloadViaNativeScp(remotePath, zipPath);
    
    // ✅ Extract
    LOG.info(`📦 Extracting ZIP archive...`);
    await this.extractZip(zipPath, localDir);
    
    // ✅ Cleanup
    try {
      unlinkSync(zipPath);
      LOG.info(`🗑️  Removed temporary ZIP file`);
    } catch (err) {
      LOG.warn(`⚠️  Could not remove ZIP file: ${err}`);
    }
    
    // ✅ Analyze
    const allFiles = readdirSync(localDir, { recursive: false, withFileTypes: true })
      .filter(f => f.isFile() && !f.name.endsWith('.zip'))
      .map(f => join(localDir, f.name));
    
    const mdbFiles = allFiles.filter(f => f.toLowerCase().endsWith('.mdb'));
    const jsonFiles = allFiles.filter(f => f.toLowerCase().endsWith('.json'));
    
    if (mdbFiles.length > 0) {
      LOG.info(`✅ Found MDB file: ${mdbFiles[0]}`);
      return {
        format: 'mdb',
        primaryFile: mdbFiles[0],
        files: mdbFiles
      };
    } else if (jsonFiles.length > 0) {
      LOG.info(`✅ Found ${jsonFiles.length} JSON files`);
      
      const primaryJson = jsonFiles.find(p => 
        p.toLowerCase().includes('shipdata') && p.toLowerCase().includes('update')
      );
      
      return {
        format: 'json',
        files: jsonFiles,
        primaryFile: primaryJson
      };
    } else {
      throw new Error('No .mdb or .json files found in ZIP archive');
    }
  }
  
  /**
   * ✅ Native SCP Download - OHNE expect/sshpass
   */
  private async downloadViaNativeScp(remotePath: string, localPath: string): Promise<void> {
    // Methode 1: SSH_ASKPASS (natives SCP mit Password-Helper-Script)
    try {
      LOG.info('   Method 1: SSH_ASKPASS');
      await this.downloadWithSshAskpass(remotePath, localPath);
      return;
    } catch (error: any) {
      LOG.warn(`   SSH_ASKPASS failed: ${error.message}`);
    }
    
    // Methode 2: Pure Node.js SSH2 SCP Protocol
    try {
      LOG.info('   Method 2: ssh2 SCP Protocol');
      await this.downloadWithSsh2Scp(remotePath, localPath);
      return;
    } catch (error: any) {
      LOG.error(`   ssh2 SCP failed: ${error.message}`);
    }
    
    throw new Error('All download methods failed. Native SCP requires working authentication.');
  }
  
  /**
   * ✅ Methode 1: SSH_ASKPASS - natives SCP ohne expect/sshpass
   */
  private async downloadWithSshAskpass(remotePath: string, localPath: string): Promise<void> {
    const { host, port, username, password } = this.config;
    
    // Create askpass script
    const askpassScript = `#!/bin/sh
echo "${password.replace(/"/g, '\\"')}"
`;
    
    const askpassPath = join('/tmp', `askpass-${Date.now()}.sh`);
    
    try {
      writeFileSync(askpassPath, askpassScript, { mode: 0o700 });
      
      const startTime = Date.now();
      
      // Use SSH_ASKPASS with DISPLAY unset
      const { stdout, stderr } = await execAsync(
        `scp -P ${port} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${username}@${host}:"${remotePath}" "${localPath}"`,
        {
          env: {
            ...process.env,
            SSH_ASKPASS: askpassPath,
            DISPLAY: ':0',  // SSH_ASKPASS requires DISPLAY to be set
            SSH_ASKPASS_REQUIRE: 'force'  // Force use of SSH_ASKPASS (OpenSSH 8.4+)
          },
          maxBuffer: 100 * 1024 * 1024,
          timeout: 300000
        }
      );
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      if (!existsSync(localPath)) {
        throw new Error('File was not downloaded');
      }
      
      LOG.info(`✅ Download completed in ${duration}s`);
      
    } finally {
      try {
        unlinkSync(askpassPath);
      } catch (err) {
        // Ignore
      }
    }
  }
  
  /**
   * ✅ Methode 2: Pure Node.js SCP mit ssh2 Package
   */
  private async downloadWithSsh2Scp(remotePath: string, localPath: string): Promise<void> {
    const { host, port, username, password } = this.config;
    
    return new Promise((resolve, reject) => {
      const conn = new SSH2Client();
      const startTime = Date.now();
      
      conn.on('ready', () => {
        LOG.info('   SSH connection established');
        
        // Execute native SCP command on remote server
        conn.exec(`scp -f "${remotePath}"`, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          
          const writeStream = createWriteStream(localPath);
          let fileSize = 0;
          let receivedSize = 0;
          let state = 'waiting-header';
          let buffer = Buffer.alloc(0);
          
          stream.on('data', (data: Buffer) => {
            if (state === 'waiting-header') {
              buffer = Buffer.concat([buffer, data]);
              const str = buffer.toString();
              
              // SCP Protocol: "C0644 <size> <filename>\n"
              const match = str.match(/^C(\d{4})\s+(\d+)\s+(.+)\n/);
              if (match) {
                fileSize = parseInt(match[2], 10);
                const headerLength = match[0].length;
                
                LOG.info(`   File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
                
                // Send ACK
                stream.write(Buffer.from([0]));
                
                // Start receiving file data
                state = 'receiving-data';
                buffer = buffer.slice(headerLength);
                
                if (buffer.length > 0) {
                  writeStream.write(buffer);
                  receivedSize += buffer.length;
                  buffer = Buffer.alloc(0);
                }
              }
            } else if (state === 'receiving-data') {
              const remaining = fileSize - receivedSize;
              const chunk = data.slice(0, remaining);
              
              writeStream.write(chunk);
              receivedSize += chunk.length;
              
              if (receivedSize >= fileSize) {
                writeStream.end();
                
                // Send ACK
                stream.write(Buffer.from([0]));
                
                const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                LOG.info(`✅ Download completed in ${duration}s`);
                
                conn.end();
                resolve();
              }
            }
          });
          
          stream.on('close', () => {
            conn.end();
          });
          
          stream.stderr.on('data', (data: Buffer) => {
            LOG.error('SCP stderr:', data.toString());
          });
          
          // Send initial ACK to start transfer
          stream.write(Buffer.from([0]));
        });
      });
      
      conn.on('error', (err) => {
        reject(err);
      });
      
      conn.connect({
        host,
        port,
        username,
        password,
        readyTimeout: 60000
      });
    });
  }
  
  /**
   * ✅ Extract ZIP mit unzipper
   */
  private async extractZip(zipPath: string, extractTo: string): Promise<void> {
    try {
      const directory = await unzipper.Open.file(zipPath);
      
      await directory.extract({ 
        path: extractTo,
        concurrency: 5
      });
      
      LOG.info(`✅ Extracted ${directory.files.length} file(s)`);
    } catch (error) {
      LOG.error(`❌ ZIP extraction failed:`, error);
      throw error;
    }
  }
  
  async listFiles(remotePath: string = '/'): Promise<any[]> {
    try {
      await this.client.connect({
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        password: this.config.password,
        readyTimeout: 60000,
        keepaliveInterval: 10000,
      });
      
      this.connected = true;
      const files = await this.client.list(remotePath);
      await this.client.end();
      this.connected = false;
      
      return files;
      
    } catch (error) {
      LOG.error('❌ List files failed:', error);
      throw error;
    } finally {
      if (this.connected) {
        try {
          await this.client.end();
          this.connected = false;
        } catch (err) {
          // Ignore
        }
      }
    }
  }
  
  async getAvailableDeltaUpdates(fromDate: string, toDate: string): Promise<string[]> {
    LOG.info(`🔍 Searching for delta updates from ${fromDate} to ${toDate}...`);
    
    const files = await this.listFiles('/json');
    
    const deltaUpdates = files
      .filter(f => {
        const match = f.name.match(/^ShipData_(\d{8})_Update\.zip$/);
        if (!match) return false;
        
        const fileDate = match[1];
        return fileDate >= fromDate && fileDate <= toDate;
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(f => f.name);
    
    LOG.info(`   Found ${deltaUpdates.length} delta update(s)`);
    
    return deltaUpdates;
  }
}
