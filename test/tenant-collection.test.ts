import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient, type Document } from "mongodb";
import { TenantCollection, tenantDocument, tenantFilter } from "../src/core/tenant-collection.js";

const uri = process.env.MONGODB_TEST_URI;

test("tenant collection scopes every query and mutation to one company", { skip: !uri }, async () => {
  const dbName = "bee_tenant_scope_" + Date.now();
  const client = new MongoClient(uri!);
  await client.connect();
  try {
    const raw = client.db(dbName).collection<Contact>("contacts");
    const alpha = new TenantCollection<Contact>(raw, "company-alpha");
    const beta = new TenantCollection<Contact>(raw, "company-beta");

    await alpha.createTenantUniqueIndex({ email: 1 }, "tenant_email_unique");
    await alpha.insertOne({ id: "alpha-contact", email: "same@example.test", label: "Alpha record" });
    await beta.insertOne({ id: "beta-contact", email: "same@example.test", label: "Beta record" });

    assert.equal(await alpha.countDocuments({}), 1);
    assert.equal(await beta.countDocuments({}), 1);
    assert.equal((await alpha.findOne({ id: "beta-contact" })), null);
    assert.equal((await beta.findOne({ id: "alpha-contact" })), null);

    const crossTenantUpdate = await alpha.updateOne({ id: "beta-contact" }, { $set: { label: "tampered" } });
    assert.equal(crossTenantUpdate.matchedCount, 0);
    const crossTenantDelete = await alpha.deleteOne({ id: "beta-contact" });
    assert.equal(crossTenantDelete.deletedCount, 0);
    assert.equal((await beta.findOne({ id: "beta-contact" }))?.label, "Beta record");

    assert.throws(
      () => alpha.insertOne({ id: "bad-contact", email: "bad@example.test", label: "Bad", tenantId: "company-beta" }),
      /does not match/
    );
    assert.throws(
      () => alpha.updateOne({ id: "alpha-contact" }, { $set: { tenantId: "company-beta" } } as never),
      /tenantId is immutable/
    );
    assert.throws(
      () => alpha.updateOne({ id: "alpha-contact" }, { tenantId: "company-beta" } as never),
      /Replacement updates are not supported/
    );

    assert.equal((await raw.listIndexes().toArray()).some(index => index.name === "tenant_email_unique"), true);
  } finally {
    await client.db(dbName).dropDatabase();
    await client.close();
  }
});

test("tenant helpers reject missing or conflicting tenant context", () => {
  assert.deepEqual(tenantDocument("company-alpha", { id: "one", label: "one" }), {
    id: "one", label: "one", tenantId: "company-alpha"
  });
  assert.throws(() => tenantDocument("company-alpha", { id: "one", tenantId: "company-beta" }), /does not match/);
  assert.throws(() => tenantFilter("", {}), /non-empty tenantId/);
  const filter = tenantFilter("company-alpha", { $or: [{ id: "one" }, { id: "two" }] });
  assert.deepEqual(filter, { $and: [{ $or: [{ id: "one" }, { id: "two" }] }, { tenantId: "company-alpha" }] });
});

type Contact = Document & { id: string; tenantId: string; email: string; label: string };
