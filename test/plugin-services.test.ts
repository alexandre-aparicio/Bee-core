import { test } from "node:test";
import assert from "node:assert/strict";
import { BeePluginServices, type FilesStorageService } from "../src/core/plugin-services.js";
import { FilesStorageAdapter } from "../src/plugins/documents/files-storage.adapter.js";

test("plugin service registry publishes and resolves typed host contracts", () => {
  const services = new BeePluginServices();
  const storage: FilesStorageService = {
    async getMetadata() { return null; },
    async read() { return Buffer.from("file"); }
  };
  services.register("files.storage", storage);
  assert.equal(services.get<FilesStorageService>("files.storage"), storage);
  assert.throws(() => services.register("files.storage", storage), /already registered/);
  assert.throws(() => services.register("invalid", storage), /Invalid plugin service key/);
});

test("Documents Files adapter delegates through the Files contract without owning storage", async () => {
  const calls: string[] = [];
  const storage: FilesStorageService = {
    async getMetadata(tenantId, fileId) {
      calls.push("metadata:" + tenantId + ":" + fileId);
      return { id: fileId, tenantId, originalName: "report.pdf", contentType: "application/pdf", size: 4, storageKey: fileId, uploadedBy: "user-1", createdAt: new Date(0) };
    },
    async read(tenantId, fileId) {
      calls.push("read:" + tenantId + ":" + fileId);
      return Buffer.from("data");
    }
  };
  const adapter = new FilesStorageAdapter(storage);
  const metadata = await adapter.getMetadata("tenant-a", "123e4567-e89b-12d3-a456-426614174000");
  assert.equal(metadata?.originalName, "report.pdf");
  assert.equal((await adapter.read("tenant-a", metadata!)).toString(), "data");
  await assert.rejects(() => adapter.read("tenant-b", metadata!), /Invalid tenant file reference/);
  assert.deepEqual(calls, [
    "metadata:tenant-a:123e4567-e89b-12d3-a456-426614174000",
    "read:tenant-a:123e4567-e89b-12d3-a456-426614174000"
  ]);
});
