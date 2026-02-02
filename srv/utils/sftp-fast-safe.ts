// srv/utils/sftp-fast-safe.ts
import Client from 'ssh2-sftp-client';
import * as fs from 'fs';
import * as path from 'path';
import StreamZip from 'node-stream-zip';
import { createHash } from 'crypto';
import cds from '@sap/cds';
import * as unzipper from 'unzipper';
import { open as fsOpen } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import type { Algorithms, SFTPWrapper } from 'ssh2';
import { Client as ScpClient } from 'node-scp';

// Optional: .env lokal/BAS
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config();
} catch { /* ignore if dotenv not present */ }

// Optional: SAP Cloud SDK für Destination
let sdkConnectivity: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  sdkConnectivity = require('@sap-cloud-sdk/connectivity');
} catch { /* ignore if SDK not present */ }

const LOG = cds.log('sftp-fast-safe');

/* ========================= Typen ========================= */

type SftpAuth = {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: Buffer | string;
  privateKeyPath?: string;
  passphrase?: string;
};

type DownloadOptions = {
  remotePath: string;
  localPath: string;
  extractTo: string;

  concurrency?: number;     // fastGet
  chunkSize?: number;       // fastGet
  retries?: number;

  stableChecks?: number;
  stableDelayMs?: number;

  expectSha256Path?: string;
  zipPassword?: string;
  requireDoneFlag?: {
    path: string;
    waitTimeoutMs?: number;
    pollIntervalMs?: number;
  };

  /** 'node-scp' (empfohlen), 'pipeline' (roh SFTP-Stream), 'fast' (fastGet+Fallback) */
  downloadMode?: 'node-scp' | 'pipeline' | 'fast';

  /** Nur für SFTP-Verbindungen: 'ctr-only' oder 'default' */
  algorithmsProfile?: 'ctr-only' | 'default';

  /** Tiefe ZIP-Prüfung (Deflate-Probe) */
  validateDeep?: boolean;

  /** Name der BTP Destination (optional; hat Vorrang vor .env) */
  destinationName?: string;
};

/* ========================= Helpers allgemein ========================= */

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isBtpRuntime() {
  return !!(process.env.VCAP_APPLICATION || process.env.VCAP_SERVICES);
}

/* ========================= Datei-Utilities ========================= */

async function readFirstBytes(file: string, n: number) {
  const fd = await fs.promises.open(file, 'r');
  try {
    const buf = Buffer.alloc(n);
    await fd.read(buf, 0, n, 0);
    return buf;
  } finally {
    await fd.close();
  }
}

async function readTail(file: string, n: number) {
  const st = await fs.promises.stat(file);
  const readN = Math.min(n, st.size);
  const fd = await fs.promises.open(file, 'r');
  try {
    const buf = Buffer.alloc(readN);
    await fd.read(buf, 0, readN, st.size - readN);
    return buf;
  } finally {
    await fd.close();
  }
}

async function isZipHeader(file: string) {
  const head = await readFirstBytes(file, 4);
  // PK\x03\x04 – SFX/empty ZIPs können abweichen
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}

// 1 MiB Tail-Suche für robustere EOCD-Erkennung
async function hasEOCDOrZIP64(file: string) {
  const tail = await readTail(file, 1_048_576);
  const EOCD = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const ZIP64_EOCD = Buffer.from([0x50, 0x4b, 0x06, 0x06]);
  const ZIP64_LOC = Buffer.from([0x50, 0x4b, 0x06, 0x07]);
  const hasEOCD = tail.includes(EOCD);
  const hasZIP64 = tail.includes(ZIP64_EOCD) && tail.includes(ZIP64_LOC);
  return hasEOCD || hasZIP64;
}

async function analyzeEOCD(file: string) {
  const tail = await readTail(file, 1_048_576);
  const EOCD_SIG = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const idx = tail.lastIndexOf(EOCD_SIG);
  if (idx === -1) return null;
  const view = tail.subarray(idx);
  if (view.length < 22) return null;

  const diskNo = view.readUInt16LE(4);
  const cdDisk = view.readUInt16LE(6);
  const entriesDisk = view.readUInt16LE(8);
  const entriesTotal = view.readUInt16LE(10);
  const cdSize = view.readUInt32LE(12);
  const cdOffset = view.readUInt32LE(16);
  const commentLen = view.readUInt16LE(20);
  return { diskNo, cdDisk, entriesDisk, entriesTotal, cdSize, cdOffset, commentLen, eocdPosFromTail: idx };
}

async function sha256OfFile(file: string) {
  const hash = createHash('sha256');
  const stream = fs.createReadStream(file);
  return new Promise<string>((resolve, reject) => {
    stream.on('data', (d) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/* ========================= Auth-Resolver (.env / Destination) ========================= */

type ResolvedAuth = SftpAuth & { source: 'env' | 'destination' };

function parsePrivateKeyFromEnv(): { privateKey?: Buffer | string; privateKeyPath?: string; passphrase?: string } {
  const keyPath = process.env.SFTP_PRIVATE_KEY_PATH;
  const keyPem = process.env.SFTP_PRIVATE_KEY;
  const keyB64 = process.env.SFTP_PRIVATE_KEY_BASE64;
  const passphrase = process.env.SFTP_PASSPHRASE;

  if (keyPath) return { privateKeyPath: keyPath, passphrase };
  if (keyPem) return { privateKey: keyPem.replace(/\\n/g, '\n'), passphrase };
  if (keyB64) return { privateKey: Buffer.from(keyB64, 'base64'), passphrase };
  return { passphrase };
}

async function resolveAuthFromEnv(): Promise<ResolvedAuth | null> {
  const host = process.env.SFTP_HOST;
  const username = process.env.SFTP_USER;
  if (!host || !username) return null;

  const port = Number(process.env.SFTP_PORT || 22);
  const password = process.env.SFTP_PASSWORD;               // <— RENAMED
  const { privateKey, privateKeyPath, passphrase } = parsePrivateKeyFromEnv();

  return {
    host,
    port,
    username,
    password,
    privateKey,
    privateKeyPath,
    passphrase,
    source: 'env'
  };
}

// Destination → SftpAuth Mapping
function mapDestinationPropsToAuth(props: any): SftpAuth {
  const url = props.URL ?? props.url;
  let host = props.host ?? props.Host;
  let port = props.port ? Number(props.port) : undefined;

  if (!host && url) {
    try {
      const u = url.startsWith('sftp://') || url.startsWith('ssh://') ? new URL(url) : new URL(`sftp://${url}`);
      host = u.hostname;
      if (!port) port = u.port ? Number(u.port) : 22;
    } catch { /* ignore */ }
  }

  const username = props.user ?? props.username ?? props.User ?? props.userid;
  const password = props.password ?? props.Password;

  let privateKey: string | Buffer | undefined;
  if (props.privateKeyBase64) privateKey = Buffer.from(props.privateKeyBase64, 'base64');
  else if (props.privateKey) privateKey = props.privateKey;
  else if (props.sshPrivateKey) privateKey = props.sshPrivateKey;

  const passphrase = props.passphrase ?? props.Passphrase;

  return {
    host: host!,
    port: port ?? 22,
    username: username!,
    password,
    privateKey,
    passphrase
  };
}

async function resolveAuthFromDestination(destName: string): Promise<ResolvedAuth> {
  // SAP Cloud SDK
  if (sdkConnectivity && isBtpRuntime()) {
    try {
      const { getDestination, serviceToken } = sdkConnectivity;
      const jwt = await serviceToken('destination');
      const dest = await getDestination({ destinationName: destName }, { jwt });
      if (dest) {
        const props = (dest as any).originalProperties ?? (dest as any);
        const auth = mapDestinationPropsToAuth(props);
        return { ...auth, source: 'destination' };
      }
      LOG.warn(`Destination "${destName}" not found via Destination Service.`);
    } catch (e: any) {
      LOG.warn(`Destination lookup via SDK failed: ${e?.message || e}`);
    }
  }

  // Fallback: process.env.destinations JSON
  try {
    const raw = process.env.destinations;
    if (raw) {
      const arr = JSON.parse(raw) as any[];
      const found = arr.find(d => d.Name === destName || d.name === destName);
      if (found) {
        const props = found || {};
        const auth = mapDestinationPropsToAuth(props);
        return { ...auth, source: 'destination' };
      }
    }
  } catch (e: any) {
    LOG.warn(`Parsing process.env.destinations failed: ${e?.message || e}`);
  }

  throw new Error(`Destination "${destName}" konnte nicht aufgelöst werden (SDK & env.destinations).`);
}

/**
 * Effektive Auth ermitteln:
 * 1) Falls inputAuth voll ist → nutzen
 * 2) Destination (o.destinationName oder BTP_DESTINATION_NAME)
 * 3) .env
 */
async function resolveEffectiveAuth(inputAuth: Partial<SftpAuth> | undefined, o: DownloadOptions): Promise<ResolvedAuth> {
  if (inputAuth?.host && inputAuth?.username && (inputAuth.password || inputAuth.privateKey || inputAuth.privateKeyPath)) {
    return { ...(inputAuth as SftpAuth), source: 'env' };
  }
  const destName = o.destinationName || process.env.BTP_DESTINATION_NAME;
  if (destName) {
    const a = await resolveAuthFromDestination(destName);
    LOG.info(`🔐 Auth resolved from Destination: ${destName}`);
    return a;
  }
  const envAuth = await resolveAuthFromEnv();
  if (envAuth) {
    LOG.info(`🔐 Auth resolved from .env`);
    return envAuth;
  }
  throw new Error(`Keine Verbindungsdaten gefunden. Bitte .env setzen (SFTP_HOST/SFTP_USER/SFTP_PASSWORD...) oder destinationName angeben.`);
}

/* ========================= SFTP‑Utilities ========================= */

async function fetchRemoteSha256_sftp(sftp: Client, remoteShaPath: string) {
  try {
    const tmp = `${path.basename(remoteShaPath)}.${Date.now()}.tmp`;
    const localTmp = path.join('/tmp', tmp);
    await sftp.get(remoteShaPath, localTmp);
    const content = await fs.promises.readFile(localTmp, 'utf8');
    await fs.promises.unlink(localTmp).catch(() => {});
    const token = content.trim().split(/\s+/)[0];
    if (!token || token.length < 32) return null;
    return token.toLowerCase();
  } catch {
    return null;
  }
}

async function waitForDoneFlag_sftp(sftp: Client, donePath: string, timeoutMs: number, pollMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await sftp.stat(donePath);
      return true;
    } catch { /* not yet */ }
    await sleep(pollMs);
  }
  return false;
}

async function isRemoteStable(sftp: Client, remotePath: string, checks: number, delayMs: number) {
  if (checks <= 1) return true;
  let prev: string | null = null;
  for (let i = 0; i < checks; i++) {
    const st = await sftp.stat(remotePath);
    const cur = `${st.size}-${st.modifyTime}`;
    if (prev !== null && cur === prev) return true;
    prev = cur;
    if (i < checks - 1) await sleep(delayMs);
  }
  return false;
}

async function validateLocalMatchesRemote(sftp: Client, remotePath: string, localPath: string) {
  const [r, l] = await Promise.all([sftp.stat(remotePath), fs.promises.stat(localPath)]);
  if (Number(r.size) !== Number(l.size)) {
    throw new Error(`Size mismatch remote=${r.size} local=${l.size}`);
  }
}

// `.part`-Datei bei Fehlern sichern oder löschen
async function handlePartOnError(tmpPath: string, attempt: number) {
  try {
    if (fs.existsSync(tmpPath)) {
      const diag = `${tmpPath}.attempt${attempt}.keep`;
      await fs.promises.rename(tmpPath, diag);
      LOG.info(`🧩 Partielle Datei zu Diagnose gesichert: ${diag}`);
    }
  } catch {
    try { await fs.promises.unlink(tmpPath); } catch {}
  }
}

/* ========================= SFTP-Downloads (fast/pipeline) ========================= */

async function atomicDownloadFast(
  sftp: Client,
  remotePath: string,
  localPath: string,
  opts: { concurrency: number; chunkSize: number },
  totalSize: number,
  attempt: number
) {
  const tmp = `${localPath}.part`;
  try { await fs.promises.unlink(tmp); } catch {}
  LOG.info(`   Starting fastGet with concurrency=${opts.concurrency}, chunkSize=${opts.chunkSize}`);
  let lastProgress = 0;
  let lastLogTime = Date.now();
  const startTime = Date.now();

  try {
    await sftp.fastGet(remotePath, tmp, {
      concurrency: opts.concurrency,
      chunkSize: opts.chunkSize,
      step: (transferred: number, _chunk: number, total: number) => {
        const now = Date.now();
        const progress = Math.floor((transferred / total) * 100);
        if (progress >= lastProgress + 5 || now - lastLogTime > 2000) {
          const mbTransferred = (transferred / 1024 / 1024).toFixed(1);
          const mbTotal = (total / 1024 / 1024).toFixed(1);
          const elapsed = ((now - startTime) / 1000).toFixed(0);
          const speed = transferred > 0 ? ((transferred / 1024 / 1024) / ((now - startTime) / 1000)).toFixed(1) : '0.0';
          LOG.info(`   ${progress}% | ${mbTransferred}/${mbTotal} MB | ${speed} MB/s | ${elapsed}s`);
          lastProgress = progress;
          lastLogTime = now;
        }
      }
    });
    const tmpStat = await fs.promises.stat(tmp);
    if (tmpStat.size !== totalSize) {
      throw new Error(`Incomplete download: expected ${totalSize} bytes, got ${tmpStat.size} bytes`);
    }
    await fs.promises.rename(tmp, localPath);
  } catch (e) {
    await handlePartOnError(tmp, attempt);
    throw e;
  }
}

async function atomicDownloadSimple(
  sftp: Client,
  remotePath: string,
  localPath: string,
  totalSize: number,
  attempt: number
) {
  const tmp = `${localPath}.part`;
  try { await fs.promises.unlink(tmp); } catch {}
  LOG.info(`   Using simple get() method (fallback)`);

  const startTime = Date.now();
  const progressInterval = setInterval(async () => {
    try {
      if (fs.existsSync(tmp)) {
        const stat = await fs.promises.stat(tmp);
        const progress = Math.floor((stat.size / totalSize) * 100);
        const mbTransferred = (stat.size / 1024 / 1024).toFixed(1);
        const mbTotal = (totalSize / 1024 / 1024).toFixed(1);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const speed = stat.size > 0
          ? ((stat.size / 1024 / 1024) / ((Date.now() - startTime) / 1000)).toFixed(1)
          : '0.0';
        LOG.info(`   ${progress}% | ${mbTransferred}/${mbTotal} MB | ${speed} MB/s | ${elapsed}s`);
      }
    } catch { /* ignore */ }
  }, 2000);

  try {
    await sftp.get(remotePath, tmp);
    clearInterval(progressInterval);
    const tmpStat = await fs.promises.stat(tmp);
    if (tmpStat.size !== totalSize) throw new Error(`Incomplete download: expected ${totalSize} bytes, got ${tmpStat.size} bytes`);
    await fs.promises.rename(tmp, localPath);
  } catch (e) {
    clearInterval(progressInterval);
    await handlePartOnError(tmp, attempt);
    throw e;
  }
}

/** Rohes SFTPWrapper holen (für Pipeline-Stream) */
async function getRawSftpFromClient(sftp: Client): Promise<SFTPWrapper> {
  const ssh2Client: any = (sftp as any).client;
  if (!ssh2Client || typeof ssh2Client.sftp !== 'function') {
    throw new Error('Underlying ssh2 client not available (client.sftp is not a function)');
  }
  return await new Promise<SFTPWrapper>((resolve, reject) => {
    ssh2Client.sftp((err: any, sftpRaw: SFTPWrapper) => {
      if (err) return reject(err);
      resolve(sftpRaw);
    });
  });
}

async function atomicDownloadPipeline(sftp: Client, remotePath: string, localPath: string) {
  const tmp = `${localPath}.part`;
  try { await fs.promises.unlink(tmp); } catch {}
  await fs.promises.mkdir(path.dirname(localPath), { recursive: true });

  const sftpRaw = await getRawSftpFromClient(sftp);
  const readStream: NodeJS.ReadableStream = sftpRaw.createReadStream(remotePath, {
    flags: 'r',
    highWaterMark: 64 * 1024,
  });
  const writeStream = createWriteStream(tmp, { flags: 'w' });
  await pipeline(readStream, writeStream);
  await fs.promises.rename(tmp, localPath);
}

/* ========================= node-scp Download ========================= */

async function downloadWithNodeScp(
  auth: { host: string; port?: number; username: string; password?: string; privateKey?: string | Buffer; passphrase?: string },
  remotePath: string,
  localPath: string
) {
  const tmp = `${localPath}.part`;
  try { await fs.promises.unlink(tmp); } catch {}
  await fs.promises.mkdir(path.dirname(localPath), { recursive: true });

  const client = await ScpClient({
    host: auth.host,
    port: auth.port ?? 22,
    username: auth.username,
    password: auth.password,
    privateKey: auth.privateKey
      ? (Buffer.isBuffer(auth.privateKey) ? auth.privateKey.toString() : auth.privateKey)
      : undefined,
    passphrase: auth.passphrase
  });

  try {
    await client.downloadFile(remotePath, tmp);
    await fs.promises.rename(tmp, localPath);
  } finally {
    await client.close().catch(() => {});
  }
}

async function fetchRemoteSha256_nodeScp(
  auth: { host: string; port?: number; username: string; password?: string; privateKey?: string | Buffer; passphrase?: string },
  remoteShaPath: string
): Promise<string | null> {
  const tmp = path.join('/tmp', `${path.basename(remoteShaPath)}.${Date.now()}.sha`);
  try {
    await downloadWithNodeScp(auth, remoteShaPath, tmp);
    const content = await fs.promises.readFile(tmp, 'utf8');
    const token = content.trim().split(/\s+/)[0];
    return token && token.length >= 32 ? token.toLowerCase() : null;
  } catch {
    return null;
  } finally {
    try { await fs.promises.unlink(tmp); } catch {}
  }
}

/* ========================= ZIP Extract (mit Fallback) ========================= */

// Heuristik: lokaler Header
type ZipLocalHeaderInfo = { offset: number; gpFlags: number; encrypted: boolean; versionNeeded: number; compMethod: number; };
async function scanFirstLocalHeader(file: string, maxScanBytes = 2 * 1024 * 1024): Promise<ZipLocalHeaderInfo | null> {
  const fd = await fsOpen(file, 'r');
  try {
    const buf = Buffer.alloc(maxScanBytes);
    const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
    const slice = buf.subarray(0, bytesRead);
    const sig = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const idx = slice.indexOf(sig, 0);
    if (idx === -1) return null;
    const view = slice.subarray(idx);
    if (view.length < 30) return null;
    const versionNeeded = view.readUInt16LE(4);
    const gpFlags = view.readUInt16LE(6);
    const compMethod = view.readUInt16LE(8);
    const encrypted = (gpFlags & 0x0001) !== 0;
    return { offset: idx, gpFlags, encrypted, versionNeeded, compMethod };
  } finally {
    await fd.close();
  }
}

function detectMultipart(zipPath: string): string[] {
  const dir = path.dirname(zipPath);
  const stem = path.basename(zipPath).replace(/\.zip$/i, '');
  const parts: string[] = [];
  for (let i = 1; i < 100; i++) {
    const part = path.join(dir, `${stem}.z${String(i).padStart(2, '0')}`);
    if (fs.existsSync(part)) parts.push(part);
    else break;
  }
  return parts;
}

type CdEntry = { fileName: string; method: number; gpFlags: number; crc32: number; compSize: number; uncompSize: number; lhOffset: number; };
async function parseCentralDirectory(file: string): Promise<{ entries: CdEntry[], fileSize: number }> {
  const fd = await fsOpen(file, 'r');
  try {
    const st = await fs.promises.stat(file);
    const fileSize = st.size;
    const tailN = Math.min(1_048_576, fileSize);
    const tailBuf = Buffer.alloc(tailN);
    await fd.read(tailBuf, 0, tailN, fileSize - tailN);

    const EOCD = Buffer.from([0x50,0x4b,0x05,0x06]);
    const idx = tailBuf.lastIndexOf(EOCD);
    if (idx === -1) throw new Error('EOCD not found in tail');

    const eocd = tailBuf.subarray(idx);
    if (eocd.length < 22) throw new Error('EOCD too short');

    const entriesTotal = eocd.readUInt16LE(10);
    const cdSize = eocd.readUInt32LE(12);
    const cdOffset = eocd.readUInt32LE(16);

    if (cdOffset + cdSize > fileSize) {
      throw new Error(`Central Directory beyond file end (cdOffset=${cdOffset}, cdSize=${cdSize}, fileSize=${fileSize})`);
    }

    const cdBuf = Buffer.alloc(cdSize);
    await fd.read(cdBuf, 0, cdSize, cdOffset);

    const entries: CdEntry[] = [];
    let p = 0;
    const CEN_SIG = 0x02014b50;

    for (let i = 0; i < entriesTotal && p + 46 <= cdBuf.length; i++) {
      const sig = cdBuf.readUInt32LE(p);
      if (sig !== CEN_SIG) break;

      const gpFlags = cdBuf.readUInt16LE(p + 8);
      const method = cdBuf.readUInt16LE(p + 10);
      const crc32 = cdBuf.readUInt32LE(p + 16);
      const compSize = cdBuf.readUInt32LE(p + 20);
      const uncompSize = cdBuf.readUInt32LE(p + 24);
      const nameLen = cdBuf.readUInt16LE(p + 28);
      const extraLen = cdBuf.readUInt16LE(p + 30);
      const commentLen = cdBuf.readUInt16LE(p + 32);
      const lhOffset = cdBuf.readUInt32LE(p + 42);

      const nameStart = p + 46;
      const name = cdBuf.subarray(nameStart, nameStart + nameLen).toString('utf8');

      entries.push({ fileName: name, method, gpFlags, crc32, compSize, uncompSize, lhOffset });

      p = nameStart + nameLen + extraLen + commentLen;
    }
    return { entries, fileSize };
  } finally {
    await fd.close();
  }
}

async function quickValidateLocalHeaders(file: string, entries: CdEntry[], fileSize: number) {
  const fd = await fsOpen(file, 'r');
  try {
    for (const e of entries) {
      if (e.lhOffset + 30 > fileSize) {
        throw new Error(`Local header for ${e.fileName} out of range (offset=${e.lhOffset})`);
      }
      const sigBuf = Buffer.alloc(4);
      await fd.read(sigBuf, 0, 4, e.lhOffset);
      if (!(sigBuf[0] === 0x50 && sigBuf[1] === 0x4b && sigBuf[2] === 0x03 && sigBuf[3] === 0x04)) {
        throw new Error(`Local header signature missing for ${e.fileName} at offset ${e.lhOffset}`);
      }

      const lhFixed = Buffer.alloc(30);
      await fd.read(lhFixed, 0, 30, e.lhOffset);
      const nameLen = lhFixed.readUInt16LE(26);
      const extraLen = lhFixed.readUInt16LE(28);
      const dataStart = e.lhOffset + 30 + nameLen + extraLen;

      if (dataStart > fileSize) {
        throw new Error(`Data start beyond file size for ${e.fileName} (dataStart=${dataStart})`);
      }
      if (dataStart + e.compSize > fileSize) {
        throw new Error(`Compressed data overruns file for ${e.fileName} (dataStart=${dataStart}, compSize=${e.compSize}, fileSize=${fileSize})`);
      }
    }
  } finally {
    await fd.close();
  }
}

import { createInflateRaw } from 'node:zlib';
async function inflateProbe(file: string, entry: CdEntry): Promise<void> {
  const fd = await fsOpen(file, 'r');
  try {
    const lhFixed = Buffer.alloc(30);
    await fd.read(lhFixed, 0, 30, entry.lhOffset);
    const nameLen = lhFixed.readUInt16LE(26);
    const extraLen = lhFixed.readUInt16LE(28);
    const dataStart = entry.lhOffset + 30 + nameLen + extraLen;

    const rs = fs.createReadStream(file, { start: dataStart, end: dataStart + entry.compSize - 1 });
    const infl = createInflateRaw(); // ZIP Deflate ist "raw" ohne zlib-Header

    await new Promise<void>((resolve, reject) => {
      rs.on('error', reject);
      infl.on('error', reject);
      infl.on('data', () => {}); // /dev/null
      infl.on('end', resolve);
      rs.pipe(infl);
    });
  } finally {
    await fd.close();
  }
}

async function verifyZipByInflating(file: string, limitEntries = 3) {
  const { entries } = await parseCentralDirectory(file);
  const pick = entries.filter(e => e.method === 8 && e.compSize > 0).slice(0, limitEntries);
  for (const e of pick) {
    await inflateProbe(file, e); // wirft, wenn Deflate-Stream defekt
  }
}

async function robustExtractZip(zipPath: string, extractTo: string, zipPassword?: string) {
  await fs.promises.mkdir(extractTo, { recursive: true });

  if (zipPassword) {
    LOG.warn('⚠️ ZIP password provided, but common Node ZIP libs do not reliably support AES-zip.');
  }

  const headerInfo = await scanFirstLocalHeader(zipPath).catch(() => null);
  if (headerInfo) {
    const bit3DataDescriptor = (headerInfo.gpFlags & 0x0008) !== 0;
    LOG.info(
      `ZIP first local header at offset=${headerInfo.offset}, enc=${headerInfo.encrypted}, gpFlags=0x${headerInfo.gpFlags.toString(16)}, ` +
      `bit3(dataDescriptor)=${bit3DataDescriptor}, comp=${headerInfo.compMethod}, verNeeded=${headerInfo.versionNeeded}`
    );
    if (headerInfo.encrypted) {
      throw new Error(`ZIP ist verschlüsselt (General Purpose Bit Flag gesetzt). Bitte unverschlüsselt liefern oder serverseitig entpacken.`);
    }
  }

  const parts = detectMultipart(zipPath);
  if (parts.length > 0) {
    LOG.warn(`⚠️ Detected multipart ZIP parts: ${parts.join(', ')}.`);
  }

  // 1) Erst node-stream-zip
  try {
    const zip = new (StreamZip as any).async({ file: zipPath, storeEntries: true });
    try {
      const entries = await zip.entries();
      if (!entries || Object.keys(entries).length === 0) {
        throw new Error('ZIP has no entries (possibly empty/corrupt).');
      }
      await zip.extract(null, extractTo);
      return entries as Record<string, any>;
    } finally {
      await zip.close();
    }
  } catch (e1: any) {
    LOG.warn(`⚠️ node-stream-zip failed: ${e1?.message || e1}. Trying unzipper fallback...`);

    // 2) Fallback: unzipper
    const entries: Record<string, { size?: number }> = {};
    try {
      await new Promise<void>((resolve, reject) => {
        const rs = fs.createReadStream(zipPath);
        const parser = unzipper.Parse();

        parser.on('entry', async (entry: any) => {
          const outPath = path.join(extractTo, entry.path);
          if (entry.type === 'Directory') {
            await fs.promises.mkdir(outPath, { recursive: true }).catch(() => {});
            entry.autodrain();
            return;
          }
          await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
          const ws = fs.createWriteStream(outPath);
          entry.pipe(ws);
          ws.on('finish', () => { entries[entry.path] = { size: entry.vars?.uncompressedSize }; });
          ws.on('error', reject);
          entry.on('error', reject);
        });

        parser.on('close', resolve);
        parser.on('error', reject);
        rs.pipe(parser);
        rs.on('error', reject);
      });

      if (Object.keys(entries).length === 0) {
        throw new Error('unzipper extracted 0 entries (possibly empty/corrupt).');
      }
      return entries;
    } catch (e2: any) {
      const [hasEOCD, hasLocal] = await Promise.all([
        hasEOCDOrZIP64(zipPath).catch(() => false),
        isZipHeader(zipPath).catch(() => false)
      ]);
      const eocd = await analyzeEOCD(zipPath).catch(() => null);
      const hint: string[] = [];
      hint.push(`EOCD/ZIP64=${hasEOCD}`);
      hint.push(`LocalHeaderAtStart=${hasLocal}`);
      if (eocd) {
        hint.push(`entriesTotal=${eocd.entriesTotal}`);
        hint.push(`cdSize=${eocd.cdSize}`);
        hint.push(`cdOffset=${eocd.cdOffset}`);
        hint.push(`commentLen=${eocd.commentLen}`);
      } else {
        hint.push('EOCD=not-detected-in-tail(1MiB)');
      }
      if (headerInfo) {
        const bit3 = (headerInfo.gpFlags & 0x0008) !== 0;
        hint.push(`gpFlags=0x${headerInfo.gpFlags.toString(16)}`);
        hint.push(`bit3(dataDescriptor)=${bit3}`);
        hint.push(`comp=${headerInfo.compMethod}`);
      } else {
        hint.push('LocalHeaderScan=none-found-or>2MiB');
      }
      if (parts.length > 0) hint.push(`multipartParts=${parts.length}`);

      throw new Error(
        `ZIP extraction failed in both engines. ${hint.join(', ')}; ` +
        `stream-zip err="${e1?.message || e1}", unzipper err="${e2?.message || e2}"`
      );
    }
  }
}

/* ========================= SSH Algorithms builder (nur SFTP) ========================= */

function buildAlgorithms(profile: 'ctr-only' | 'default'): Algorithms {
  if (profile === 'default') {
    return {
      cipher: ['aes128-gcm@openssh.com', 'aes256-gcm@openssh.com', 'aes128-ctr', 'aes192-ctr', 'aes256-ctr'] as Algorithms['cipher'],
      hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'] as Algorithms['hmac'],
      kex: ['ecdh-sha2-nistp256', 'diffie-hellman-group-exchange-sha256', 'diffie-hellman-group14-sha1'] as Algorithms['kex'],
      serverHostKey: ['ssh-ed25519', 'ssh-rsa'] as Algorithms['serverHostKey'],
      compress: ['none'] as Algorithms['compress']
    };
  }
  return {
    cipher: ['aes256-ctr', 'aes192-ctr', 'aes128-ctr'] as Algorithms['cipher'],
    hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'] as Algorithms['hmac'],
    kex: ['ecdh-sha2-nistp256', 'diffie-hellman-group-exchange-sha256', 'diffie-hellman-group14-sha1'] as Algorithms['kex'],
    serverHostKey: ['ssh-ed25519', 'ssh-rsa'] as Algorithms['serverHostKey'],
    compress: ['none'] as Algorithms['compress']
  };
}

/* ========================= Main: Download + Verify + Extract ========================= */

export async function downloadVerifyExtract(inputAuth: Partial<SftpAuth> | undefined, o: DownloadOptions) {
  const {
    remotePath,
    localPath,
    extractTo,
    concurrency = 16,
    chunkSize = 64 * 1024,
    retries = 3,
    stableChecks: stableChecksIn = 2,
    stableDelayMs: stableDelayMsIn = 2000,
    expectSha256Path,
    zipPassword,
    requireDoneFlag,
    downloadMode = 'node-scp',       // Default jetzt: node-scp
    algorithmsProfile = 'ctr-only',
    validateDeep = false,
    destinationName
  } = o;

  const auth = await resolveEffectiveAuth(inputAuth, o);
  const stableChecks = stableChecksIn ?? 2;
  const stableDelayMs = stableDelayMsIn ?? 2000;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const startTime = Date.now();
    LOG.info(`🧭 Mode: ${downloadMode} | Attempt ${attempt}/${retries}`);
    LOG.info(`   Host: ${auth.host}:${auth.port ?? 22} | User: ${auth.username} | Source: ${auth.source}`);

    // --- node-scp Modus ---
    if (downloadMode === 'node-scp') {
      try {
        // Done-Flag (falls gefordert) über kurzes SFTP statten
        if (requireDoneFlag) {
          LOG.info(`⏳ Waiting for done flag via short SFTP session: ${requireDoneFlag.path}`);
          const sftp = new Client();
          try {
            await sftp.connect({
              host: auth.host,
              port: auth.port ?? 22,
              username: auth.username,
              password: auth.password,
              privateKey: auth.privateKey,
              readyTimeout: 60_000
            });
            const ok = await waitForDoneFlag_sftp(
              sftp,
              requireDoneFlag.path,
              requireDoneFlag.waitTimeoutMs ?? 10 * 60_000,
              requireDoneFlag.pollIntervalMs ?? 10_000
            );
            if (!ok) throw new Error(`Done-Flag not found within timeout: ${requireDoneFlag.path}`);
            LOG.info(`✅ Done flag found`);
          } finally {
            try { await sftp.end(); } catch {}
          }
        }

        // Optional: Remote SHA via node-scp
        let remoteSha: string | null = null;
        if (expectSha256Path) {
          LOG.info(`🔐 Fetching remote SHA256 via node-scp: ${expectSha256Path}`);
          remoteSha = await fetchRemoteSha256_nodeScp(auth, expectSha256Path);
          if (remoteSha) LOG.info(`   Remote SHA256: ${remoteSha}`);
          else LOG.warn(`   ⚠️ Could not fetch SHA256 checksum via node-scp`);
        }

        // Download per node-scp
        LOG.info(`📥 node-scp download starting...`);
        LOG.info(`   Remote: ${remotePath}`);
        LOG.info(`   Local : ${localPath}`);
        const downloadStart = Date.now();

        await downloadWithNodeScp(auth, remotePath, localPath);

        const downloadDuration = ((Date.now() - downloadStart) / 1000).toFixed(1);
        LOG.info(`✅ node-scp download complete in ${downloadDuration}s`);

        // Größe loggen
        const lstat = await fs.promises.stat(localPath);
        LOG.info(`   Local size: ${(lstat.size / 1024 / 1024).toFixed(2)} MB`);

        // SHA256 loggen & ggf. vergleichen
        try {
          const sha = await sha256OfFile(localPath);
          LOG.info(`🔢 Local SHA256: ${sha}`);
          if (remoteSha && sha.toLowerCase() !== remoteSha.toLowerCase()) {
            throw new Error(`SHA256 mismatch after node-scp: local=${sha}, remote=${remoteSha}`);
          }
        } catch (e) {
          if (!remoteSha) LOG.warn(`⚠️ Could not compute/compare SHA256: ${(e as Error).message}`);
          else throw e;
        }

        // ZIP Checks
        const hasEOCD = await hasEOCDOrZIP64(localPath);
        const hasLocalHeader = await isZipHeader(localPath);
        if (!hasEOCD && !hasLocalHeader) {
          throw new Error('ZIP integrity check failed: missing EOCD/ZIP64 and no local header signature');
        }
        if (!hasLocalHeader) LOG.warn('⚠️ ZIP does not start with PK\\x03\\x04 (could be empty ZIP or SFX).');
        LOG.info(`✅ ZIP integrity validated (EOCD/ZIP64 or local header present)`);

        // Optional: Deep Validation
        if (validateDeep) {
          try {
            const { entries, fileSize } = await parseCentralDirectory(localPath);
            await quickValidateLocalHeaders(localPath, entries, fileSize);
            await verifyZipByInflating(localPath, 3);
            LOG.info(`🔎 Deep ZIP validation: structure and deflate probe OK`);
          } catch (valErr) {
            throw new Error(`Deep ZIP validation failed: ${(valErr as Error).message}`);
          }
        }

        // Extraktion: temp → atomar tauschen
        LOG.info(`📦 Extracting ZIP file to: ${extractTo}`);
        const extractStart = Date.now();
        const parent = path.dirname(extractTo);
        await fs.promises.mkdir(parent, { recursive: true });
        const tmpExtract = path.join(parent, `.extract-${Date.now()}`);
        await fs.promises.mkdir(tmpExtract, { recursive: true });

        const entries = await robustExtractZip(localPath, tmpExtract, zipPassword);

        const backupOld = `${extractTo}.backup-${Date.now()}`;
        try { await fs.promises.rename(extractTo, backupOld); } catch { /* not exist */ }
        await fs.promises.mkdir(path.dirname(extractTo), { recursive: true });
        await fs.promises.rename(tmpExtract, extractTo);
        try { await fs.promises.rm(backupOld, { recursive: true, force: true }); } catch {}

        const entryCount = Object.keys(entries).length;
        const extractDuration = ((Date.now() - extractStart) / 1000).toFixed(1);
        LOG.info(`✅ Extracted ${entryCount} files in ${extractDuration}s`);

        const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
        LOG.info(`✅ Complete (node-scp mode) in ${totalDuration}s`);
        return { ok: true, attempt, entries };

      } catch (err) {
        LOG.error(`❌ Attempt ${attempt} failed (node-scp mode):`, err);
        LOG.error(`   Error type: ${(err as Error).constructor.name}`);
        LOG.error(`   Error message: ${(err as Error).message}`);

        try {
          if (fs.existsSync(localPath)) {
            const corruptedPath = `${localPath}.corrupted.attempt${attempt}`;
            await fs.promises.rename(localPath, corruptedPath);
            LOG.info(`🔍 Corrupted file saved: ${corruptedPath}`);
          }
        } catch {}

        if (attempt === retries) {
          LOG.error(`❌ All ${retries} attempts failed (node-scp mode)`);
          throw err;
        }
        const backoffMs = 5_000 * attempt;
        LOG.info(`⏳ Waiting ${backoffMs / 1000}s before retry...`);
        await sleep(backoffMs);
        continue;
      }
    }

    // --- SFTP-basierte Modi (pipeline/fast) ---
    const algorithms = buildAlgorithms(algorithmsProfile);
    const sftp = new Client();

    LOG.info(`🔗 Connecting to SFTP server (attempt ${attempt}/${retries})...`);
    LOG.info(`   Host: ${auth.host}:${auth.port ?? 22}`);
    LOG.info(`   User: ${auth.username}`);

    await sftp.connect({
      host: auth.host,
      port: auth.port ?? 22,
      username: auth.username,
      password: auth.password,
      privateKey: auth.privateKey,
      readyTimeout: 60_000,
      keepaliveInterval: 10_000,
      keepaliveCountMax: 3,
      debug: (msg: string) => LOG.info(`[ssh2] ${msg}`),
      algorithms
    });
    LOG.info(`✅ Connected successfully`);

    try {
      LOG.info(`📊 Checking remote file: ${remotePath}`);
      const fileStat = await sftp.stat(remotePath);
      const expectedSize = Number(fileStat.size);
      LOG.info(`   Size: ${(expectedSize / 1024 / 1024).toFixed(2)} MB`);
      LOG.info(`   Modified: ${fileStat.modifyTime}`);

      if (requireDoneFlag) {
        LOG.info(`⏳ Waiting for done flag: ${requireDoneFlag.path}`);
        const ok = await waitForDoneFlag_sftp(
          sftp,
          requireDoneFlag.path,
          requireDoneFlag.waitTimeoutMs ?? 10 * 60_000,
          requireDoneFlag.pollIntervalMs ?? 10_000
        );
        if (!ok) throw new Error(`Done-Flag not found within timeout: ${requireDoneFlag.path}`);
        LOG.info(`✅ Done flag found`);
      } else if (stableChecks > 1) {
        LOG.info(`🔍 Checking file stability (${stableChecks} checks)...`);
        const stable = await isRemoteStable(sftp, remotePath, stableChecks, stableDelayMs);
        LOG.info(stable ? `✅ File is stable` : `⚠️ File may still be uploading`);
      }

      await fs.promises.mkdir(path.dirname(localPath), { recursive: true });

      let remoteSha: string | null = null;
      if (expectSha256Path) {
        LOG.info(`🔐 Fetching SHA256 checksum from: ${expectSha256Path}`);
        remoteSha = await fetchRemoteSha256_sftp(sftp, expectSha256Path);
        if (remoteSha) LOG.info(`   Remote SHA256: ${remoteSha}`);
        else LOG.warn(`   ⚠️  Could not fetch SHA256 checksum`);
      }

      LOG.info(`📥 Starting download...`);
      LOG.info(`   Mode: ${downloadMode}`);
      LOG.info(`   Remote: ${remotePath}`);
      LOG.info(`   Local : ${localPath}`);
      const downloadStart = Date.now();

      try {
        if (downloadMode === 'pipeline') {
          await atomicDownloadPipeline(sftp, remotePath, localPath);
        } else {
          try {
            await atomicDownloadFast(sftp, remotePath, localPath, { concurrency, chunkSize }, expectedSize, attempt);
          } catch (fastGetErr: any) {
            LOG.warn(`⚠️  fastGet failed: ${fastGetErr?.message || fastGetErr}`);
            LOG.info(`   Trying fallback method...`);
            await atomicDownloadSimple(sftp, remotePath, localPath, expectedSize, attempt);
          }
        }
      } finally { /* noop */ }

      const downloadDuration = ((Date.now() - downloadStart) / 1000).toFixed(1);
      const avgSpeed = ((expectedSize / 1024 / 1024) / parseFloat(downloadDuration)).toFixed(2);
      LOG.info(`✅ Download complete in ${downloadDuration}s`);
      LOG.info(`   Avg speed: ${avgSpeed} MB/s`);

      LOG.info(`🔍 Verifying download...`);
      await validateLocalMatchesRemote(sftp, remotePath, localPath);
      LOG.info(`✅ File size verified`);

      // SHA256 loggen
      try {
        const sha = await sha256OfFile(localPath);
        LOG.info(`🔢 Local SHA256: ${sha}`);
        if (remoteSha && sha.toLowerCase() !== remoteSha.toLowerCase()) {
          throw new Error(`SHA256 mismatch: local=${sha}, remote=${remoteSha}`);
        }
      } catch (e) {
        if (remoteSha) throw e;
        LOG.warn(`⚠️ Could not compute/compare SHA256: ${(e as Error).message}`);
      }

      const hasEOCD = await hasEOCDOrZIP64(localPath);
      const hasLocalHeader = await isZipHeader(localPath);
      if (!hasEOCD && !hasLocalHeader) {
        throw new Error('ZIP integrity check failed: missing EOCD/ZIP64 and no local header signature');
      }
      if (!hasLocalHeader) LOG.warn('⚠️ ZIP does not start with PK\\x03\\x04 (could be empty ZIP or SFX).');
      LOG.info(`✅ ZIP integrity validated (EOCD/ZIP64 or local header present)`);

      if (validateDeep) {
        try {
          const { entries, fileSize } = await parseCentralDirectory(localPath);
          await quickValidateLocalHeaders(localPath, entries, fileSize);
          await verifyZipByInflating(localPath, 3);
          LOG.info(`🔎 Deep ZIP validation: structure and deflate probe OK`);
        } catch (valErr) {
          throw new Error(`Deep ZIP validation failed: ${(valErr as Error).message}`);
        }
      }

      LOG.info(`📦 Extracting ZIP file to: ${extractTo}`);
      const extractStart = Date.now();
      const parent = path.dirname(extractTo);
      await fs.promises.mkdir(parent, { recursive: true });
      const tmpExtract = path.join(parent, `.extract-${Date.now()}`);
      await fs.promises.mkdir(tmpExtract, { recursive: true });

      const entries = await robustExtractZip(localPath, tmpExtract, zipPassword);

      const backupOld = `${extractTo}.backup-${Date.now()}`;
      try { await fs.promises.rename(extractTo, backupOld); } catch {}
      await fs.promises.mkdir(path.dirname(extractTo), { recursive: true });
      await fs.promises.rename(tmpExtract, extractTo);
      try { await fs.promises.rm(backupOld, { recursive: true, force: true }); } catch {}

      const entryCount = Object.keys(entries).length;
      const extractDuration = ((Date.now() - extractStart) / 1000).toFixed(1);
      LOG.info(`✅ Extracted ${entryCount} files in ${extractDuration}s`);

      await sftp.end();
      LOG.info(`🔌 SFTP connection closed`);

      const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
      LOG.info(`✅ Complete (${downloadMode}) in ${totalDuration}s`);
      return { ok: true, attempt, entries };

    } catch (err) {
      await (async () => { try { await (sftp as any).end(); } catch {} })();
      LOG.error(`❌ Attempt ${attempt} failed (${downloadMode} mode):`, err);
      LOG.error(`   Error type: ${(err as Error).constructor.name}`);
      LOG.error(`   Error message: ${(err as Error).message}`);

      try {
        if (fs.existsSync(localPath)) {
          const corruptedPath = `${localPath}.corrupted.attempt${attempt}`;
          await fs.promises.rename(localPath, corruptedPath);
          LOG.info(`🔍 Corrupted file saved: ${corruptedPath}`);
        }
      } catch {}
      try {
        const tmp = `${localPath}.part`;
        if (fs.existsSync(tmp)) {
          const diag = `${tmp}.attempt${attempt}.keep`;
          await fs.promises.rename(tmp, diag);
          LOG.info(`🧩 Kept partial file for diagnostics: ${diag}`);
        }
      } catch {}

      if (attempt === retries) {
        LOG.error(`❌ All ${retries} attempts failed (${downloadMode})`);
        throw err;
      }
      const backoffMs = 5_000 * attempt;
      LOG.info(`⏳ Waiting ${backoffMs / 1000}s before retry...`);
      await sleep(backoffMs);
    }
  }

  throw new Error('unreachable');
}