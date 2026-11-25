import { createHash, createPrivateKey, createPublicKey, sign, verify as verifySignature } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { deflateRawSync } from "node:zlib";

const ROOT = resolve(process.cwd());
const DIST = join(ROOT, "dist");
const OUTPUT = resolve(process.env.BEE_PLUGIN_PACKAGE_OUTPUT ?? "artifacts/plugin-packages");
const RUNTIME_VERSION = process.env.BEE_RUNTIME_VERSION ?? "0.3.1";
const PACKAGES = [
  { id: "connected-devices", name: "Connected Devices", version: "0.1.0", entry: "plugins/connected-devices/connected-devices.plugin.js", dependencies: ["auth", "organizations"], tenantDependencies: [], activationPolicy: "manual", category: "platform", description: "Tenant device pairing, identity and capability grants.", frontendSource: "src/plugins/connected-devices/frontend", frontend: { routes: [{ path: "/dashboard/connected-devices", component: "connected-devices" }], entrypoint: "frontend/index.html", assets: ["frontend/index.html", "frontend/main.js", "frontend/qrcode.min.js"], apiPrefixes: ["/connected-devices"] } },
  { id: "time-tracking", name: "Control Horario", version: "0.2.0", entry: "plugins/time-tracking/time-tracking.plugin.js", dependencies: ["auth", "organizations"], tenantDependencies: [], activationPolicy: "automatic", category: "productivity", description: "Employee time clock, breaks and work-session history.", migrations: [{ id: "001_create_time_tracking_indexes", checksum: "cab33997679133194d812b3f7ef827097ca45a925dcfcc55083a58bc90321b37", phase: "install" }], frontendSource: "src/plugins/time-tracking/frontend", frontend: { routes: [{ path: "/dashboard/time-tracking", component: "bee-time-tracking" }], entrypoint: "frontend/index.html", assets: ["frontend/index.html", "frontend/main.js"], apiPrefixes: ["/time-tracking"] } },
  { id: "documents", name: "Documents", version: "0.1.0", entry: "plugins/documents/documents.plugin.js", dependencies: ["auth", "organizations", "files"], tenantDependencies: ["files"], activationPolicy: "automatic", category: "platform", description: "Tenant document library, folder ACLs and controlled public delivery.", frontendSource: "src/plugins/documents/frontend", frontend: { routes: [{ path: "/dashboard/documents", component: "documents" }], entrypoint: "frontend/index.html", assets: ["frontend/index.html", "frontend/main.js"], apiPrefixes: ["/documents", "/files"] } },
  { id: "hello-world", name: "Hola Mundo", version: "0.1.0", entry: "plugins/hello-world/hello-world.plugin.js", dependencies: ["auth", "organizations"], tenantDependencies: [], activationPolicy: "manual", category: "website", description: "Minimal tenant plugin used to verify the generic package lifecycle.", frontend: { routes: [{ path: "/hello-world", component: "hello-world" }], entrypoint: "frontend/index.html", assets: ["frontend/index.html", "frontend/main.js"], apiPrefixes: [] } }
];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(files) {
  const local = [], central = [];
  let offset = 0;
  for (const [name, data] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const nameBytes = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6); header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(nameBytes.length, 26);
    local.push(header, nameBytes, compressed);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(0x0314, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x0800, 8); directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(nameBytes.length, 28);
    directory.writeUInt32LE((0o100644 << 16) >>> 0, 38); directory.writeUInt32LE(offset, 42);
    central.push(directory, nameBytes);
    offset += header.length + nameBytes.length + compressed.length;
  }
  const centralBytes = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}
function digestPackage(files) {
  const hash = createHash("sha256");
  for (const [name, data] of [...files.entries()].filter(([name]) => name !== "bee-plugin.json").sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(name, "utf8"); hash.update(Buffer.from([0])); hash.update(createHash("sha256").update(data).digest("hex"), "ascii"); hash.update(Buffer.from([10]));
  }
  return hash.digest("hex");
}
function importSpecifiers(source) {
  const found = new Set();
  const patterns = [
    /(?:^|\n)\s*import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /(?:^|\n)\s*export\s+[\s\S]*?\s+from\s+["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g
  ];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) found.add(match[1]);
  return [...found].filter(specifier => specifier.startsWith("."));
}
async function collectModuleGraph(entryRelative, distDir) {
  const collected = new Map(), visited = new Set(), root = resolve(distDir);
  async function visit(relativePath) {
    const normalized = relativePath.split(sep).join("/");
    if (visited.has(normalized)) return;
    visited.add(normalized);
    const absolute = resolve(root, normalized), rel = relative(root, absolute);
    if (!rel || rel.startsWith(".." + sep) || rel === "..") throw new Error("Module dependency escaped dist/: " + normalized);
    const source = await readFile(absolute);
    collected.set("dist/" + normalized, source);
    for (const specifier of importSpecifiers(source.toString("utf8"))) {
      const target = resolve(dirname(absolute), specifier), targetRelative = relative(root, target);
      if (!targetRelative || targetRelative.startsWith(".." + sep)) throw new Error("Relative import escaped dist/: " + specifier);
      await visit(relative(root, extname(target) ? target : target + ".js"));
    }
  }
  await visit(entryRelative);
  return collected;
}
function canonicalPayload(manifest) {
  return Buffer.from(["bee-plugin-package-v1", manifest.id, manifest.version, manifest.publisher, manifest.package.sha256].join("\n"), "utf8");
}
function exportName(id) {
  return { "connected-devices": "connectedDevicesPlugin", "time-tracking": "timeTrackingPlugin", documents: "documentsPlugin", "hello-world": "helloWorldPlugin" }[id];
}

export async function buildPluginPackages({ privateKeyPem, publicKeyPem, outputDir = OUTPUT, distDir = DIST, runtimeVersion = RUNTIME_VERSION }) {
  if (!privateKeyPem?.trim()) throw new Error("BEE_PLUGIN_PUBLISHER_PRIVATE_KEY is required to sign release packages.");
  if (!publicKeyPem?.trim()) throw new Error("BEE_PLUGIN_PUBLISHER_PUBLIC_KEY is required to verify release packages.");
  let privateKey, publicKey;
  try {
    privateKey = createPrivateKey(privateKeyPem.replace(/\\n/g, "\n"));
    publicKey = createPublicKey(publicKeyPem.replace(/\\n/g, "\n"));
  } catch {
    throw new Error("The configured plugin publisher key pair is invalid.");
  }
  const supportedKeyTypes = new Set(["ed25519", "rsa"]);
  if (
    privateKey.asymmetricKeyType !== publicKey.asymmetricKeyType ||
    !supportedKeyTypes.has(privateKey.asymmetricKeyType ?? "")
  ) {
    throw new Error("Plugin publisher keys must be a matching Ed25519 or RSA key pair.");
  }
  const derivedPublicKey = createPublicKey(privateKey).export({ type: "spki", format: "der" });
  const configuredPublicKey = publicKey.export({ type: "spki", format: "der" });
  if (!derivedPublicKey.equals(configuredPublicKey)) {
    throw new Error("BEE_PLUGIN_PUBLISHER_PRIVATE_KEY does not match BEE_PLUGIN_PUBLISHER_PUBLIC_KEY.");
  }
  // Match the runtime verifier: EdDSA uses a null digest; RSA signatures use SHA-256.
  const signatureAlgorithm = privateKey.asymmetricKeyType === "ed25519" ? null : "sha256";
  const output = resolve(outputDir);
  await mkdir(output, { recursive: true });
  const results = [];
  for (const definition of PACKAGES) {
    const entry = resolve(distDir, definition.entry), entryRelative = relative(resolve(distDir), entry);
    const files = await collectModuleGraph(entryRelative, distDir);
    const wrapperPath = "dist/backend/index.mjs";
    files.set(wrapperPath, Buffer.from("export { " + exportName(definition.id) + " as default } from \"../" + definition.entry.replaceAll("\\", "/") + "\";\n"));
    files.set("package.json", Buffer.from(JSON.stringify({ type: "module", private: true }, null, 2) + "\n"));
    if (definition.frontendSource && definition.frontend) {
      for (const asset of definition.frontend.assets ?? []) {
        const sourcePath = join(ROOT, definition.frontendSource, asset.slice("frontend/".length));
        files.set(asset, await readFile(sourcePath));
      }
    }
    if (definition.id === "hello-world") {
      files.set("frontend/index.html", Buffer.from('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hola Mundo</title><style>body{font:16px system-ui;margin:0;padding:28px;color:#172033;background:#fff}.card{max-width:680px;margin:auto;padding:28px;border:1px solid #e6eaf0;border-radius:16px;background:#fbfcfe}h1{margin:0 0 8px;color:#ea7a22}.muted{color:#667085}</style></head><body><main class="card"><p class="muted">BEE PROJECTS · TENANT PACKAGE</p><h1>¡Hola Mundo!</h1><p>Este módulo se ha cargado desde un paquete ZIP firmado, sin un componente Angular registrado en el núcleo.</p><p id="context" class="muted">Conectando con Bee Core…</p></main><script type="module" src="main.js"></script></body></html>'));
      files.set("frontend/main.js", Buffer.from('const context = document.getElementById("context");\nwindow.addEventListener("message", event => { if (event.data?.type !== "bee-plugin:init") return; context.textContent = "Paquete cargado · rol: " + String(event.data.role ?? "member"); });\nwindow.parent.postMessage({ type: "bee-plugin:ready" }, "*");\n'));
    }
    files.set("README.md", Buffer.from("# " + definition.name + "\n\nBee Core signed installable package.\n\nPackage ID: " + definition.id + "\nVersion: " + definition.version + "\n"));
    const manifest = {
      id: definition.id, name: definition.name, version: definition.version, publisher: "Bee Projects",
      description: definition.description, category: definition.category, activationPolicy: definition.activationPolicy,
      compatibility: { minRuntimeVersion: runtimeVersion },
      dependencies: definition.dependencies.map(pluginId => ({ pluginId, versionRange: "*" })),
      tenantDependencies: definition.tenantDependencies,
      permissions: [], backend: { entrypoint: wrapperPath }, frontend: definition.frontend ?? { routes: [] },
      collections: [], migrations: definition.migrations ?? [], settingsSchema: { type: "object", properties: {} },
      package: { sha256: "", signature: "", storageKey: "packages/" + definition.id + "/" + definition.version }
    };
    manifest.package.sha256 = digestPackage(files);
    const signature = sign(signatureAlgorithm, canonicalPayload(manifest), privateKey);
    if (!verifySignature(signatureAlgorithm, canonicalPayload(manifest), publicKey, signature)) {
      throw new Error("Generated plugin publisher signature could not be verified.");
    }
    manifest.package.signature = signature.toString("base64");
    for (const requiredPath of [
      manifest.backend.entrypoint,
      ...(manifest.frontend.entrypoint ? [manifest.frontend.entrypoint] : []),
      ...(manifest.frontend.assets ?? [])
    ]) {
      if (!files.has(requiredPath)) throw new Error("Package " + definition.id + " is missing declared asset: " + requiredPath);
    }
    files.set("bee-plugin.json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n"));
    const archive = zip(files), target = join(output, definition.id + "-" + definition.version + ".zip");
    await writeFile(target, archive);
    results.push({ id: definition.id, version: definition.version, path: target, bytes: archive.length, files: files.size, digest: manifest.package.sha256 });
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const results = await buildPluginPackages({ privateKeyPem: process.env.BEE_PLUGIN_PUBLISHER_PRIVATE_KEY ?? "", publicKeyPem: process.env.BEE_PLUGIN_PUBLISHER_PUBLIC_KEY ?? "" });
  for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
}
