# Building a Bee-Core business plugin

This guide describes the current trusted, statically bundled plugin workflow. It is the reference pattern for backend and Angular code until immutable package archive distribution and dynamic component loading are completed.

## 1. Create the backend package

Create `src/plugins/<plugin-id>/<plugin-id>.plugin.ts` and export a `BeePlugin`:

```ts
export const examplePlugin: BeePlugin = {
  manifest: {
    name: "example",
    version: "0.1.0",
    description: "Example company feature",
    dependencies: ["auth", "organizations", "marketplace"],
    frontend: { routes: [{ path: "/dashboard/example", component: "bee-example" }] }
  },
  async initialize(ctx) {
    // Connect to MongoDB and register API routes.
  },
  async stop() {
    // Close resources.
  }
};
```

Register it in `src/index.ts` after its declared dependencies. The plugin manager validates dependency ordering during startup.

## 2. Resolve company context and permissions

For every protected route:
1. Verify the JWT using `request.jwtVerify()`.
2. Resolve the persisted session and active membership with `resolveTenantContext(db, request.user)`, or use `requireAuth(db, "dashboard")`.
3. Check a stable permission key with `requireTenantPermissions("example.read")`.
4. Check that the company is entitled to and has installed the plugin with `requireInstalledPlugin(db, "example")`.

Never trust `tenantId` from a body, query parameter or arbitrary header. The active tenant comes from the verified session and membership.

## 3. Scope every business collection

Use `TenantCollection` for all company-owned records:

```ts
const records = new TenantCollection<ExampleRecord>(
  db.collection<ExampleRecord>("tenant_example_records"),
  tenantContext.tenantId
);
const record = await records.findOne({ id: requestedId });
```

The facade scopes reads, updates, deletes and counts, stamps inserts, prevents tenant ownership changes and supports tenant-prefixed unique indexes. Do not retain or expose a second raw collection reference for business queries.

Add cross-company tests for list, detail, update and delete. Two companies must be able to use the same business key without seeing each other's records.

## 4. Register the trusted package and plan access

Add a `PluginPackageDefinition` in `src/core/plugin-entitlements.ts`:
- unique plugin ID and semantic version;
- description/category and visible plan IDs;
- included plan IDs and whether individual purchase is allowed;
- system flag and plugin dependencies;
- tenant install/update/uninstall hooks. Migration IDs and checksums are immutable; each migration should provide a `down` handler when its effects can be compensated.

The trusted package registry is code-reviewed and bundled in the server image. MongoDB stores catalogue/version metadata and company entitlement/installation state. The manifest validator rejects invalid semantic dependency ranges, duplicate dependency/permission/collection/migration/route declarations and unsafe paths. Do not add arbitrary executable JavaScript from user uploads to the registry. Digest/signature fields are contract metadata today; cryptographic package verification is not yet connected to installation.

## 5. Build the Angular component

Create a standalone component under `apps/web/src/app/<plugin-id>/`. Use the authenticated API and never send a client-selected tenant ID. Mount it only when the marketplace reports that the active company has both entitlement and installation.

For write controls, pass the active company role or effective permission state and hide actions the user cannot perform. The backend must still enforce the permission independently.

Register the standalone component in `BeePluginFrontendRegistry`; `BeePluginOutletComponent` mounts it when the marketplace reports the plugin as entitled and installed. The registry currently contains statically bundled trusted components; the manifest route is metadata, not a remote Angular loader. Remote frontend loading remains intentionally disabled until immutable package archives and publisher verification are implemented.

## 6. Tests required before merging

- backend typecheck and production build;
- MongoDB integration tests using at least two companies;
- entitlement filtering by plan and individual purchase;
- install/update/uninstall, migration rollback after injected hook/migration failures and data preservation after revocation;
- stale-worker lease rejection and long-running lease renewal;
- member/manager/admin permission tests;
- Angular production build and Playwright test for install, UI activation and CRUD;
- Docker Compose full-stack integration.

## Current reference implementation

The `hello-world` package demonstrates the minimal signed-ZIP runtime contract. Marketplace lifecycle and tenant-isolation integration tests use a test-only generic workspace fixture; it is not shipped as a product module.

## Not yet available

- arbitrary third-party package upload or remote code execution;
- immutable central package archives and install-time signature verification;
- dynamic Angular component/route loading;
- durable install/upgrade jobs and full migration rollback;
- public-site plugin component registration;
- payment checkout and customer billing portal.

Do not bypass these constraints by importing or executing untrusted package code.


## Host services, permissions and frontend compatibility

A plugin package must declare only the host capabilities it needs in `requiredServices`. Supported names are `mongo`, `session-resource-ids`, `file-storage`, `auth-bootstrap`, `billing-webhook`, `public-domain`, `plugin-package-storage` and `plugin-publisher-public-key`. Unknown service names fail plugin initialization with an actionable error; the host no longer grants configuration by matching a plugin ID.

Each manifest permission is structured and self-describing:

- `key`: stable permission key, such as `time-tracking.clock`
- `module`, `resource`, `action`, `label`, `description`
- `defaultGrants`: explicit booleans for `owner`, `admin`, `manager` and `member`
- optional `customRoleAssignable` (defaults to true)

Bee Core composes a tenant's effective permission catalogue only from installed packages. When a package is uninstalled, its permissions disappear from effective access and the tenant role editor, but custom-role documents retain their stored permission keys. Reinstalling the package makes those stored assignments effective again, subject to the platform's tenant-assignable permission policy.

ZIP manifests declare `frontendContract`. The current host contract is version 1. An incompatible package is rejected with a clear “Plugin update required” response instead of attempting to load an unsupported frontend.

Native first-party UI registers through the generic frontend contract: plugin ID, lazy component loader, navigation entries, typed input mapping and module-owned en/es catalogues. Level B ZIP-supplied UI isolation is documented separately in [the frontend decision](architecture/frontend-decision.md) and remains awaiting owner approval.
