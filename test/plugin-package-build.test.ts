import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildPluginPackages } from "../scripts/build-plugin-packages.mjs";
import { installSignedPluginZip } from "../src/core/plugin-zip-installer.js";

const distReady = existsSync(join(process.cwd(), "dist/plugins/documents/documents.plugin.js"));

test("four first-party modules build as independently signed ZIP packages", { skip: !distReady }, async () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const root = await mkdtemp(join(tmpdir(), "bee-first-party-packages-"));
  try {
    const built = await buildPluginPackages({
      privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      outputDir: join(root, "archives")
    });
    assert.deepEqual(built.map(item => item.id).sort(), ["connected-devices", "documents", "hello-world", "time-tracking"]);
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    for (const item of built) {
      assert.ok(item.bytes > 100);
      const installed = await installSignedPluginZip({
        archive: await readFile(item.path),
        storageRoot: join(root, "installed"),
        publisherPublicKey: publicKeyPem,
        runtimeVersion: "0.3.1"
      });
      assert.equal(installed.manifest.id, item.id);
      assert.ok(installed.extractedFiles >= 4);
      if (item.id === "hello-world") {
        assert.equal(installed.manifest.frontend.entrypoint, "frontend/index.html");
        assert.ok(installed.manifest.frontend.assets?.includes("frontend/main.js"));
        const html = await readFile(join(installed.packageDirectory, "frontend/index.html"), "utf8");
        const script = await readFile(join(installed.packageDirectory, "frontend/main.js"), "utf8");
        assert.match(html, /Hola Mundo/);
        assert.match(script, /bee-plugin:ready/);
      } else {
        assert.equal(installed.manifest.frontend.routes.length, 0);
      }
      const entrypoint = join(installed.packageDirectory, installed.manifest.backend.entrypoint);
      const loaded = await import(pathToFileURL(entrypoint).href) as { default?: { manifest?: { name?: string; version?: string } } };
      assert.equal(loaded.default?.manifest?.name, item.id);
      assert.equal(loaded.default?.manifest?.version, item.version);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
