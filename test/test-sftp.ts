// src/sftp-download.ts
import 'dotenv/config';
import SFTPClient from 'ssh2-sftp-client';
import fs from 'node:fs';
import path from 'node:path';


type SftpConn = {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string; // Inhalt des Keys
  passphrase?: string;
  readyTimeout?: number;
  keepaliveInterval?: number;
};


type DownloadOptions = {
  remotePath: string;
  localPath: string;
  concurrency?: number;
  chunkSize?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  verifySize?: boolean;
};


function asBool(v: string | undefined, def = false): boolean {
  if (v === undefined) return def;
  return ['1', 'true', 'yes', 'y', 'on'].includes(v.toLowerCase());
}


function asInt(v: string | undefined, def: number): number {
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}


async function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}


function parseArgs() {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
      result[key] = val;
    }
  }
  return result;
}


async function downloadSftpWithRetries(
  conn: SftpConn,
  opts: DownloadOptions
): Promise<void> {
  const {
    remotePath,
    localPath,
    concurrency = 128,
    chunkSize = 256 * 1024,
    maxRetries = 5,
    baseDelayMs = 500,
    verifySize = true,
  } = opts;

  const tmpPath = `${localPath}.part`;
  let attempt = 0;

  while (true) {
    attempt++;
    const client = new SFTPClient();

    try {
      await client.connect({
        host: conn.host,
        port: conn.port ?? 22,
        username: conn.username,
        password: conn.password,
        privateKey: conn.privateKey,
        passphrase: conn.passphrase,
        readyTimeout: conn.readyTimeout ?? 15_000,
        keepaliveInterval: conn.keepaliveInterval ?? 10_000,
      });

      // Prüfen ob bereits vollständig
      if (fs.existsSync(localPath)) {
        const rStat = await client.stat(remotePath);
        const remoteSize = rStat?.size ?? 0;
        const localSize = fs.statSync(localPath).size;
        
        if (localSize === remoteSize && remoteSize > 0) {
          await client.end();
          console.log('✅ Datei bereits vollständig vorhanden');
          return;
        }
      }

      // Verzeichnis erstellen
      fs.mkdirSync(path.dirname(localPath), { recursive: true });

      // Alte .part Datei löschen (fastGet unterstützt kein Resume)
      if (fs.existsSync(tmpPath)) {
        fs.rmSync(tmpPath);
      }

      console.log(`Download-Modus: fastGet mit ${concurrency} parallelen Streams, ${chunkSize} bytes/chunk`);

      // fastGet mit parallelen Streams
      await client.fastGet(remotePath, tmpPath, {
        concurrency,
        chunkSize,
        step: (totalTransferred, chunk, total) => {
          if (total > 0) {
            const pct = ((totalTransferred / total) * 100).toFixed(1);
            const mbTransferred = (totalTransferred / (1024 * 1024)).toFixed(2);
            const mbTotal = (total / (1024 * 1024)).toFixed(2);
            process.stdout.write(
              `\rProgress: ${pct}% (${mbTransferred}/${mbTotal} MB)   `
            );
          }
        },
      });

      // Integritätscheck
      if (verifySize) {
        const rStat = await client.stat(remotePath);
        const remoteSize = rStat?.size ?? 0;
        const partStat = fs.statSync(tmpPath);
        
        if (partStat.size !== remoteSize) {
          throw new Error(
            `Unvollständiger Download: erwartet ${remoteSize}, erhalten ${partStat.size}`
          );
        }
      }

      // Atomisches Rename
      fs.renameSync(tmpPath, localPath);

      await client.end();
      process.stdout.write('\n✅ Download abgeschlossen\n');
      return;
    } catch (err) {
      try {
        await client.end();
      } catch {}

      if (attempt <= maxRetries) {
        const delay = Math.round(baseDelayMs * Math.pow(2, attempt - 1));
        console.warn(
          `Warnung: Versuch ${attempt} fehlgeschlagen: ${(err as Error).message}. Wiederhole in ${delay}ms ...`
        );
        await sleep(delay);
        continue;
      }

      console.error('❌ Endgültig gescheitert.');
      throw err;
    }
  }
}


async function main() {
  const args = parseArgs();

  const host = process.env.SFTP_HOST;
  const port = asInt(process.env.SFTP_PORT, 22);
  const username = process.env.SFTP_USER;
  const password = process.env.SFTP_PASSWORD;

  // Private Key bevorzugen, falls gesetzt
  let privateKey: string | undefined;
  const privateKeyPath = process.env.SFTP_PRIVATE_KEY_PATH;
  if (privateKeyPath && fs.existsSync(privateKeyPath)) {
    privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  }

  const passphrase = process.env.SFTP_PASSPHRASE;

  if (!host || !username || (!password && !privateKey)) {
    throw new Error(
      'Fehlende SFTP-Zugangsdaten. Bitte SFTP_HOST, SFTP_USER und SFTP_PASSWORD oder SFTP_PRIVATE_KEY_PATH in .env setzen.'
    );
  }

  const envRemote = process.env.SFTP_REMOTE_PATH;
  const remotePath = args['remote'] || envRemote;
  if (!remotePath) {
    throw new Error(
      'Kein Remote-Pfad gesetzt. Nutze --remote /pfad/zur/datei oder setze SFTP_REMOTE_PATH in .env.'
    );
  }

  const downloadDir = process.env.DOWNLOAD_DIR || './downloads';
  const cliOut = args['out'];
  let localPath: string;
  if (cliOut) {
    localPath = cliOut;
  } else {
    const fileName = path.basename(remotePath);
    localPath = path.join(downloadDir, fileName);
  }

  const concurrency = asInt(process.env.SFTP_CONCURRENCY, 128);
  const chunkSize = asInt(process.env.SFTP_CHUNK_SIZE, 256 * 1024);
  const maxRetries = asInt(process.env.SFTP_MAX_RETRIES, 6);
  const baseDelayMs = asInt(process.env.SFTP_BASE_DELAY_MS, 700);
  const verifySize = asBool(process.env.SFTP_VERIFY_SIZE, true);
  const readyTimeout = asInt(process.env.SFTP_READY_TIMEOUT_MS, 15000);
  const keepaliveInterval = asInt(process.env.SFTP_KEEPALIVE_MS, 10000);

  console.log(`Starte Download:
  Host: ${host}:${port}
  User: ${username}
  Remote: ${remotePath}
  Local: ${localPath}
  Concurrency: ${concurrency} streams
  ChunkSize: ${chunkSize} bytes
  Retries: ${maxRetries}, BaseDelay: ${baseDelayMs}ms
  VerifySize: ${verifySize}
  `);

  await downloadSftpWithRetries(
    {
      host,
      port,
      username,
      password,
      privateKey,
      passphrase,
      readyTimeout,
      keepaliveInterval
    },
    {
      remotePath,
      localPath,
      concurrency,
      chunkSize,
      maxRetries,
      baseDelayMs,
      verifySize
    }
  );
}


main().catch((e) => {
  console.error(e);
  process.exit(1);
});
