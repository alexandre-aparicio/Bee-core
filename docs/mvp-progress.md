| Scope | Status | Evidence / remaining work |
|---|---|---|
| Main baseline | Done | PRs #219–#227 integrated; generic plugin contract and tenant isolation retained. |
| Connected Devices ZIP baseline | Done | Signed ZIP runtime, tenant-scoped discovery and legacy assignment migration verified before Native Federation. |
| Native Federation architecture | Done | ADR defines Native Federation for first-party Angular remotes; isolated HTML/JS plugins remain in iframe. |
| PR #244 — Angular 22 / Connected Devices | Merged | Integrated into `main`; Native Federation host/remote architecture and Angular 22 modernization. |
| CI #1308 | Passed | SHA `1651470bd0c0fbb90280ce6a2583f726202acc93`; backend, Angular and browser jobs 3/3 green. |
| CI #1311 | Passed | PR #244 follow-up after restoring the required table-only progress document; checks 3/3 green. |
| PR #245 — plugin dependency resolution | Merged / CI passed | Automatic Angular dependency resolution for the Connected Devices plugin; CI #1315 green 3/3. |
| PR #246 — Native Federation assets without per-file JWT | Merged | Merge commit `6c23c45d1f4fdf7b7960bbfe2fe6efb3b2e2f057`; removes redundant asset JWT and uses the installed package's allowlisted static assets route. |
| CI for PR #246 | Passed | Head SHA `88ee28592d8d5f6fee6c9877af37b6611ae5528f`; Angular web build, backend build/tests and browser tests/screenshots 3/3 green. |
| Backend suite | Passed | CI evidence: 157 tests, 157 passed, 0 failed, 0 skipped. |
| Angular / Federation builds | Passed | Clean `npm ci`; production host build and Connected Devices remote build passed. |
| Signed plugin packages | Passed | Four ZIP packages built; package signature, manifest, extraction, backend and assets tests passed. PR #246 changes loader/API serving, not ZIP contents; ZIP regeneration was not required for that fix. |
| Marketplace lifecycle | Passed | Integration coverage: tenant isolation, install, enable, disable, uninstall, update and audit. |
| Browser E2E | Passed | 34/34 Playwright tests; real remote loaded; list, filters, views and DELETE without body. Six templates captured in Light/Dark. |
| VPS functional validation — Connected Devices | Passed — user confirmed | User reports deployment/test on VPS: plugin renders correctly and no errors are observed after PR #246. This is manual user-reported acceptance, not an independently executed test. |
| Tenant / visual acceptance | Partially verified | Connected Devices rendering accepted on VPS by user. Starter/Pro/Enterprise assignment matrix and all six templates in both modes remain to be explicitly checked. |
| Documents / Control Horario | Planned | Backends remain signed packages; frontend migration to Native Federation is future work, not included in PR #244/#246. |
| Phase 5 — Quality gates / bug hunt | Not started | Broader cross-plugin regression and security review remain outstanding. |
| Phase 6 — Docs / hygiene | In progress | Progress is tracked here; keep this file table-only because `test/docs-hygiene.test.ts` enforces that format. |
| Production | Not confirmed | VPS validation was reported by the user; production scope/status has not been independently established. |
| Control Horario host duplicate cleanup | Implemented | Removed the obsolete Angular host implementation and orphaned host translation catalogue; the signed Native Federation remote remains the sole frontend implementation. |
| Connected Devices connector-only permissions | Merged into `main` — VPS visual acceptance passed | PR #253; merge `a337e8c54e3c762824beba1197a8c6f591827f4a`. CI #1369: 165/165 backend tests, signed ZIP checks, host/remotes and 34/34 Playwright passed. Owner-confirmed VPS visual test: New device shows only the three `time-tracking-connected` permissions. Legacy stale capabilities remain stored but hidden; stale pending approvals return 409. |
