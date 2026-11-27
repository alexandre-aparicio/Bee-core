| Scope | Status | Evidence / remaining work |
|---|---|---|
| Main baseline | Done | PRs #219–#227 integrated; generic plugin contract and tenant isolation retained. |
| Connected Devices ZIP baseline | Done | Signed ZIP runtime, tenant-scoped discovery and legacy assignment migration verified before Native Federation. |
| Native Federation architecture | Done | ADR defines Native Federation for first-party Angular remotes; isolated HTML/JS plugins remain in iframe. |
| PR #244 — Angular 22 / Connected Devices | CI verified | Candidate branch `integration/full-stack-modernization`; current CI must pass on exact HEAD before merge. |
| CI #1308 | Passed | SHA `1651470bd0c0fbb90280ce6a2583f726202acc93`; backend, Angular and browser jobs 3/3 green. |
| Backend suite | Passed | CI: 157 tests, 157 passed, 0 failed, 0 skipped. |
| Angular / Federation builds | Passed | Clean `npm ci`; production host build and Connected Devices remote build passed. |
| Signed plugin packages | Passed | Four ZIP packages built; package signature, manifest, extraction, backend and assets tests passed. |
| Marketplace lifecycle | Passed | Integration coverage: tenant isolation, install, enable, disable, uninstall, update and audit. |
| Browser E2E | Passed | 34/34 Playwright tests; real remote loaded; list, filters, views and DELETE without body. Six templates captured in Light/Dark. |
| CI #1310 | Failed — docs only | 156/157 backend tests; `test/docs-hygiene.test.ts` requires `docs/mvp-progress.md` to contain tables only. Angular and browser jobs passed. |
| CI #1311 | Pending | Re-run required after restoring the required table-only format. |
| VPS / staging | Not verified | Upload ZIP with real signing key; verify runtime mount, protected remoteEntry/assets and Nginx/CSP headers. |
| Tenant / visual acceptance | Not verified | Confirm Starter/Pro/Enterprise assignments and existing tenant access; inspect six templates in both modes without changing tenant data. |
| Documents / Control Horario | Planned | Backends remain signed packages; frontend migration to Native Federation is future work, not included in PR #244. |
| Phase 5 — Quality gates / bug hunt | Not started | Out of scope for PR #244. |
| Phase 6 — Docs / hygiene | Not started | Out of scope beyond the progress-table constraint. |
| Production | Untouched | No deployment or data changes made; `main` remains unchanged. |
