import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { lstat, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { inflateRawSync } from "node:zlib";
import { validatePluginManifest, type BeeBusinessPluginManifest } from "./plugin-package.js";

const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED = 100 * 1024 * 1024;
const MAX_ENTRY_UNCOMPRESSED = 20 * 1024 * 1024;
const MAX_ENTRIES = 2_000;
const MAX_COMPRESSION_RATIO = 200;

type ZipEntry = { name: string; directory: boolean; method: number; flags: number; compressedSize: number; uncompressedSize: number; crc32: number; localOffset: number; centralOffset: number; };
export type InstalledZipPackage = { manifest: BeeBusinessPluginManifest; digest: string; storageKey: string; packageDirectory: string; extractedFiles: number; extractedBytes: number; };

function fail(message: string): never { throw new Error(message); }
function safeArchivePath(name: string): string {
  if (!name || name.includes("\\") || name.includes("\0") || name.startsWith("/") || /^[a-zA-Z]:/.test(name)) fail("ZIP contains an unsafe path");
  const directory = name.endsWith("/");
  const parts = name.split("/");
  if (directory) parts.pop();
  if (!parts.length || parts.some(part => !part || part === "." || part === "..")) fail("ZIP contains an unsafe path");
  const normalized = parts.join("/");
  if (normalized.length > 240) fail("ZIP entry path is too long");
  return normalized;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function readZipDirectory(archive: Buffer): ZipEntry[] {
  if (archive.length < 22 || archive.length > MAX_ARCHIVE_BYTES) fail("ZIP archive size is outside the allowed limits");
  const minimum = Math.max(0, archive.length - 65_557);
  let eocd = -1;
  for (let offset = archive.length - 22; offset >= minimum; offset--) {
    if (archive.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) fail("ZIP end-of-central-directory record was not found");
  const disk = archive.readUInt16LE(eocd + 4);
  const centralDisk = archive.readUInt16LE(eocd + 6);
  const diskEntries = archive.readUInt16LE(eocd + 8);
  const totalEntries = archive.readUInt16LE(eocd + 10);
  const centralSize = archive.readUInt32LE(eocd + 12);
  const centralOffset = archive.readUInt32LE(eocd + 16);
  const commentLength = archive.readUInt16LE(eocd + 20);
  if (disk || centralDisk || diskEntries !== totalEntries) fail("Multi-disk ZIP archives are not supported");
  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) fail("ZIP64 archives are not supported");
  if (totalEntries < 1 || totalEntries > MAX_ENTRIES) fail("ZIP entry count exceeds the allowed limit");
  if (eocd + 22 + commentLength !== archive.length || centralOffset + centralSize > eocd) fail("ZIP central directory bounds are invalid");

  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  let cursor = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < totalEntries; index++) {
    if (cursor + 46 > centralOffset + centralSize || archive.readUInt32LE(cursor) !== 0x02014b50) fail("ZIP central directory entry is malformed");
    const flags = archive.readUInt16LE(cursor + 8);
    const method = archive.readUInt16LE(cursor + 10);
    const crc = archive.readUInt32LE(cursor + 16);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const uncompressedSize = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const entryCommentLength = archive.readUInt16LE(cursor + 32);
    const startDisk = archive.readUInt16LE(cursor + 34);
    const externalAttributes = archive.readUInt32LE(cursor + 38);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const end = cursor + 46 + nameLength + extraLength + entryCommentLength;
    if (end > centralOffset + centralSize || startDisk !== 0) fail("ZIP central directory entry bounds are invalid");
    if ((flags & 0x0001) || (flags & 0x0040)) fail("Encrypted ZIP entries are not supported");
    if (method !== 0 && method !== 8) fail("ZIP compression method is not supported");
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) fail("ZIP64 entries are not supported");
    const rawName = archive.subarray(cursor + 46, cursor + 46 + nameLength);
    let decodedName: string;
    try { decodedName = new TextDecoder("utf-8", { fatal: true }).decode(rawName); }
    catch { fail("ZIP entry filename is not valid UTF-8"); }
    const name = safeArchivePath(decodedName!);
    const directory = decodedName!.endsWith("/");
    if (names.has(name.toLowerCase())) fail("ZIP contains duplicate paths");
    names.add(name.toLowerCase());
    const unixMode = externalAttributes >>> 16;
    const fileType = unixMode & 0xf000;
    if (fileType === 0xa000) fail("ZIP symbolic links are not allowed");
    if (fileType && fileType !== 0x8000 && fileType !== 0x4000) fail("ZIP special files are not allowed");
    if (directory && (uncompressedSize !== 0 || compressedSize !== 0)) fail("ZIP directory entries must be empty");
    if (uncompressedSize > MAX_ENTRY_UNCOMPRESSED) fail("ZIP entry exceeds the per-file size limit");
    if (uncompressedSize > 0 && (compressedSize === 0 || uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO)) fail("ZIP compression ratio exceeds the allowed limit");
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) fail("ZIP total uncompressed size exceeds the allowed limit");
    entries.push({ name, directory, method, flags, compressedSize, uncompressedSize, crc32: crc, localOffset, centralOffset });
    cursor = end;
  }
  if (cursor !== centralOffset + centralSize) fail("ZIP central directory size does not match its entries");
  return entries;
}

function extractEntry(archive: Buffer, entry: ZipEntry): Buffer {
  const offset = entry.localOffset;
  if (offset + 30 > archive.length || archive.readUInt32LE(offset) !== 0x04034b50) fail("ZIP local file header is malformed");
  const nameLength = archive.readUInt16LE(offset + 26);
  const extraLength = archive.readUInt16LE(offset + 28);
  const dataOffset = offset + 30 + nameLength + extraLength;
  const dataEnd = dataOffset + entry.compressedSize;
  if (dataEnd > archive.length || dataEnd > entry.localOffset + 30 + nameLength + extraLength + entry.compressedSize) fail("ZIP file data bounds are invalid");
  let localName: string;
  try { localName = new TextDecoder("utf-8", { fatal: true }).decode(archive.subarray(offset + 30, offset + 30 + nameLength)); }
  catch { fail("ZIP local filename is invalid"); }
  if (safeArchivePath(localName!) !== entry.name) fail("ZIP local and central filenames do not match");
  const compressed = archive.subarray(dataOffset, dataEnd);
  let output: Buffer;
  try {
    output = entry.method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_UNCOMPRESSED });
  } catch { fail("ZIP entry could not be safely decompressed"); }
  if (output!.length !== entry.uncompressedSize || crc32(output!) !== entry.crc32) fail("ZIP entry size or CRC check failed");
  return output!;
}

function canonicalSignaturePayload(manifest: BeeBusinessPluginManifest): Buffer {
  return Buffer.from(["bee-plugin-package-v1", manifest.id, manifest.version, manifest.publisher, manifest.package.sha256].join("\n"), "utf8");
}

function verifyPublisherSignature(manifest: BeeBusinessPluginManifest, publicKeyPem: string): void {
  if (!publicKeyPem.trim()) fail("Plugin publisher verification is not configured on this server");
  let key;
  try { key = createPublicKey(publicKeyPem.replace(/\\n/g, "\n")); }
  catch { fail("Configured plugin publisher public key is invalid"); }
  let signature: Buffer;
  try {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(manifest.package.signature)) fail("Plugin signature must be base64");
    signature = Buffer.from(manifest.package.signature, "base64");
  } catch { fail("Plugin signature encoding is invalid"); }
  const algorithm = key.asymmetricKeyType === "ed25519" || key.asymmetricKeyType === "ed448" ? null : "sha256";
  let valid = false;
  try { valid = verifySignature(algorithm, canonicalSignaturePayload(manifest), key, signature!); }
  catch { valid = false; }
  if (!valid) fail("Plugin publisher signature verification failed");
}

function packageDigest(files: Map<string, Buffer>): string {
  const hash = createHash("sha256");
  for (const [name, data] of [...files.entries()].filter(([name]) => name !== "bee-plugin.json").sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(name, "utf8"); hash.update(Buffer.from([0])); hash.update(createHash("sha256").update(data).digest("hex"), "ascii"); hash.update(Buffer.from([10]));
  }
  return hash.digest("hex");
}

function versionParts(value: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value);
  if (!match) fail("Invalid semantic version");
  return [Number(match![1]), Number(match![2]), Number(match![3])];
}
function compareVersions(a: string, b: string): number {
  const left = versionParts(a), right = versionParts(b);
  for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return left[index]! - right[index]!;
  return 0;
}

export async function installSignedPluginZip(options: {
  archive: Buffer;
  storageRoot: string;
  publisherPublicKey: string;
  runtimeVersion: string;
}): Promise<InstalledZipPackage> {
  const { archive, storageRoot, publisherPublicKey, runtimeVersion, validateManifest: validateBeforeStorage } = options;
  if (!Buffer.isBuffer(archive) || archive.length < 22 || archive.length > MAX_ARCHIVE_BYTES) fail("ZIP archive size is outside the allowed limits");
  const entries = readZipDirectory(archive);
  const files = new Map<string, Buffer>();
  let extractedBytes = 0;
  for (const entry of entries) {
    if (entry.directory) continue;
    const data = extractEntry(archive, entry);
    files.set(entry.name, data);
    extractedBytes += data.length;
  }
  const manifestBytes = files.get("bee-plugin.json");
  if (!manifestBytes) fail("Package must contain bee-plugin.json at its root");
  let manifestValue: unknown;
  try { manifestValue = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes)); }
  catch { fail("bee-plugin.json is not valid UTF-8 JSON"); }
  validatePluginManifest(manifestValue);
  const manifest = manifestValue as BeeBusinessPluginManifest;
  const digest = packageDigest(files);
  if (manifest.package.sha256.toLowerCase() !== digest) fail("Package content digest does not match bee-plugin.json");
  const expectedStorageKey = `packages/${manifest.id}/${manifest.version}`;
  if (manifest.package.storageKey !== expectedStorageKey) fail("Package storageKey must match its plugin ID and version");
  verifyPublisherSignature(manifest, publisherPublicKey);
  if (compareVersions(manifest.compatibility.minRuntimeVersion, runtimeVersion) > 0 ||
      (manifest.compatibility.maxRuntimeVersion && compareVersions(manifest.compatibility.maxRuntimeVersion, runtimeVersion) < 0)) {
    fail("Plugin package is not compatible with this Bee Core runtime");
  }
  if (!files.has(manifest.backend.entrypoint)) fail("Declared backend entrypoint is missing from the ZIP");
  if (manifest.frontend.routes.length && !files.has("frontend/index.js")) fail("Packages with frontend routes must include frontend/index.js");
  if (!files.has("README.md")) fail("Package must include README.md");

  const root = resolve(storageRoot);
  await mkdir(root, { recursive: true, mode: 0o750 });
  const packageDirectory = resolve(root, manifest.id, manifest.version);
  const relativeTarget = relative(root, packageDirectory);
  if (!relativeTarget || relativeTarget.startsWith(".." + sep) || isAbsolute(relativeTarget)) fail("Resolved package storage path is unsafe");
  const staging = await mkdtemp(join(root, ".bee-plugin-staging-"));
  try {
    for (const [name, data] of files) {
      const target = resolve(staging, name);
      const rel = relative(staging, target);
      if (!rel || rel.startsWith(".." + sep) || isAbsolute(rel)) fail("Extracted path escaped its staging directory");
      await mkdir(dirname(target), { recursive: true, mode: 0o750 });
      await writeFile(target, data, { flag: "wx", mode: 0o640 });
    }
    await mkdir(dirname(packageDirectory), { recursive: true, mode: 0o750 });
    try { await rename(staging, packageDirectory); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST" || (error as NodeJS.ErrnoException).code === "ENOTEMPTY") fail("This plugin version is already stored");
      throw error;
    }
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  return { manifest, digest, storageKey: expectedStorageKey, packageDirectory, extractedFiles: files.size, extractedBytes };
}
