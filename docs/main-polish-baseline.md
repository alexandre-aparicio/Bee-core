# Main polish baseline

| Item | Baseline |
|---|---|
| Base | `main` at `73e1f29415dcb91f119ffd2b1f8568efd912a88d` |
| CI evidence | Run `45699633886`; all 3 jobs successful (Backend build and tests, Angular web build, Template browser tests and screenshots). |
| Backend tests | 123 passed, 0 failed, 0 todo; test command summary from Backend build and tests job. |
| Browser tests | 31 passed across `e2e/smoke.spec.ts` and `e2e/templates.spec.ts`; 42 screenshots uploaded. |
| Build warnings | Angular NG8107 optional-chain warnings (8 occurrences in template compilation); Node DEP0040/DEP0169 deprecations; npm deprecated tar@6.2.1 and glob@10.5.0; GitHub Actions Node 20 deprecation warning. |
| Playwright console errors | NOT verified: current fixture does not fail on console.error/pageerror/unhandled rejection/API 5xx, and CI logs do not capture browser console events. No such event can be inferred from passing tests. |
| Flaky tests | None reported by this CI run; single run is not evidence of absence of flakiness. |
| TODO/FIXME/HACK | NOT verified: GitHub code-search returned incomplete_results=true with zero matches, so it cannot establish a repository-wide count. |
| Test skips | Backend summary reports 0 todo; skipped-test gate succeeded. Individual conditional integration skips are environment-dependent and need a separate audit. |

| Feature area | Existing coverage | Baseline gap |
|---|---|---|
| Auth/session | `test/auth.integration.test.ts`, `test/session-id.test.ts`, `test/jwt-security.test.ts`, `test/totp.test.ts` | Add token propagation and lifecycle regression coverage. |
| Tenants and members | `test/tenant-context.test.ts`, `test/auth.integration.test.ts`, `e2e/smoke.spec.ts` | Tenant switch race has one browser regression; broader concurrent lifecycle gaps. |
| Roles and custom roles | `test/role-policy.test.ts`, `test/tenant-context.test.ts`, `test/plugin-architecture.test.ts` | Generic permission composition fixture now exercises an unknown module ID; broaden tenant lifecycle matrix as future work. |
| Permission catalogue | `src/core/permission-catalog.ts`, `test/role-policy.test.ts`, `test/plugin-architecture.test.ts`, `test/plugin-manifest-discovery.test.ts` | Core permissions compose with plugin-owned manifests; fake-module fixture covers generic composition. Hidden-uninstalled-plugin coverage remains a separate gap. |
| Marketplace and plugin lifecycle / durable jobs | `test/marketplace.integration.test.ts`, `test/plugin-install-jobs.test.ts`, `test/plugin-zip-installer.test.ts` | Expand update/reinstall durability, rollback, and second-tenant discovery denial. |
| Platform admin / Super Organization | `test/platform-admin.integration.test.ts`, `test/platform-plugin-registry.test.ts` | Expand ZIP-only assertions across all first-party packages. |
| Audit log | `test/audit-log.integration.test.ts` | Add lifecycle event coverage for each plugin transition. |
| Notifications / realtime SSE / websocket | `test/notifications.integration.test.ts`, `test/realtime-limits.test.ts` | Reconnect lifecycle and unhandled rejection coverage missing. |
| Mail | No dedicated mail integration test identified in `test/` | Add mailbox/authorization/send regression coverage. |
| Teams | No dedicated teams integration test identified in `test/` | Add team membership and tenant isolation tests. |
| Files | `test/files.integration.test.ts` | Add authenticated download and permission-hidden UI coverage. |
| Documents | `src/plugins/documents/plugin.manifest.ts`, `test/plugin-package-build.test.ts`, `test/plugin-manifest-discovery.test.ts`, `test/platform-plugin-registry.test.ts` | Files dependency and manifest ownership are explicit; add degraded-mode runtime coverage in a later test pass. |
| Connected Devices | `test/connected-devices.test.ts`, `test/plugin-package-build.test.ts`, `test/connected-devices-plan-migration.test.ts`, `e2e/connected-devices.spec.ts` | Signed ZIP-only runtime, idempotent plan migration and host theme bridge are implemented; owner visual check remains pending. |
| Control Horario | `src/plugins/time-tracking/plugin.manifest.ts`, `test/plugin-package-build.test.ts`, `test/plugin-package.test.ts`, `test/time-tracking-i18n.test.ts`, `e2e/time-tracking.spec.ts` | Backend-only ZIP 0.2.1, EN/ES catalogue parity and native browser flows are green; timezone/DST expansion remains future work. |
| Templates / appearance | `e2e/templates.spec.ts`, `e2e/smoke.spec.ts`, strict style/token CI gates | Preserve all existing gates; human visual comparison remains NOT verified. |
| i18n en/es | Catalogs under `apps/web/src/app/i18n/catalogs/`, `test/time-tracking-i18n.test.ts` | Control Horario EN/ES parity and referenced-key checks are covered; repository-wide unused-key CI gate remains open. |

