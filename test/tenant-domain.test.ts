import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTenantSlug, slugifyTenantName, tenantSlugFromHost } from "../src/core/tenant-domain.js";

test("slugifies company names consistently", () => {
  assert.equal(slugifyTenantName("Dragchart"), "dragchart");
  assert.equal(slugifyTenantName("Compañía Ágil"), "compania-agil");
});

test("rejects invalid and reserved tenant slugs", () => {
  assert.throws(() => normalizeTenantSlug("two.words"));
  assert.throws(() => normalizeTenantSlug("admin"));
  assert.throws(() => normalizeTenantSlug("-bad"));
});

test("resolves only one tenant label below the configured base domain", () => {
  assert.equal(tenantSlugFromHost("dragchart.beecore.beeprojects.net", "beecore.beeprojects.net"), "dragchart");
  assert.equal(tenantSlugFromHost("beecore.beeprojects.net", "beecore.beeprojects.net"), null);
  assert.equal(tenantSlugFromHost("x.y.beecore.beeprojects.net", "beecore.beeprojects.net"), null);
  assert.equal(tenantSlugFromHost("dragchart.other.example", "beecore.beeprojects.net"), null);
});
