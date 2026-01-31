// srv/utils/mdb-export-stream.ts
import { spawn } from 'node:child_process';
import * as readline from 'node:readline';
import { Writable } from 'node:stream';

type RowHandler = (line: string) => Promise<void> | void;

export interface StreamTableOptions {
  delimiter?: string;
  dateFmt?: string;
  quote?: string;
  onLine?: RowHandler;
  sink?: Writable;
}

/**
 * Streamt eine MDB-Tabelle als CSV über mdb-export
 */
export function streamTable(
  dbPath: string,
  table: string,
  {
    delimiter = ',',
    dateFmt = '%Y-%m-%d',
    quote = '"',
    onLine,
    sink
  }: StreamTableOptions = {}
): Promise<void> {
  const args = ['-D', dateFmt, '-d', delimiter, '-Q', quote, dbPath, table];
  const child = spawn('mdb-export', args, { 
    stdio: ['ignore', 'pipe', 'pipe'] 
  });

  child.stderr.on('data', (buf) => {
    process.stderr.write(`[mdb-export stderr] ${buf}`);
  });

  const rl = readline.createInterface({ input: child.stdout });

  return new Promise<void>((resolve, reject) => {
    rl.on('line', async (line) => {
      try {
        if (sink) {
          const ok = sink.write(line + '\n');
          if (!ok) {
            rl.pause();
            sink.once('drain', () => rl.resume());
          }
        } else if (onLine) {
          await onLine(line);
        } else {
          const ok = process.stdout.write(line + '\n');
          if (!ok) {
            rl.pause();
            process.stdout.once('drain', () => rl.resume());
          }
        }
      } catch (e) {
        rl.close();
        child.kill();
        reject(e);
      }
    });

    rl.once('close', () => {
      resolve();
    });

    child.once('error', (err) => {
      rl.close();
      reject(err);
    });

    child.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(`mdb-export exited with code ${code}`));
      }
    });
  });
}

/**
 * Liste alle Tabellen in einer MDB-Datei
 */
export function listTables(dbPath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('mdb-tables', ['-1', dbPath]);
    let output = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.once('error', reject);
    
    child.once('close', (code) => {
      if (code === 0) {
        const tables = output.trim().split('\n').filter(t => t);
        resolve(tables);
      } else {
        reject(new Error(`mdb-tables exited with code ${code}`));
      }
    });
  });
}

/**
 * Prüfe ob mdb-tools installiert ist
 */
export function checkMDBTools(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('mdb-export', ['--version']);
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}
