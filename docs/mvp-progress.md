# MVP progress

| Scope | Status | Evidence / remaining work |
|---|---|---|
| Main CI baseline | Done | CI Run 987, SHA `e4598686`; ZIP-only Connected Devices merge baseline. |
| Baseline diagnostics | Partial | TODO=0, FIXME=0, HACK=0 verified by CI Run #45802486238; browser console-error guard remains NOT verified. |
| Phase 1 — Retire Team Notes | Done | PR #219 merge `b3aa4c6`; tenant data preserved; CI run #45706575499. |
| Phase 2 — Generic plugin contract | Done | PR #220 merge `d49f7d9`; exact-head CI run #45713713078, 3/3 jobs green. |
| Phase 3 — Control Horario baseline | Done | PR #221 merge `be4d291`; exact-head CI run #45718122238, 3/3 jobs green. Follow-up cleanup/i18n: PR #226 merged `e53f6aa`; exact-head CI run #45799701387 and post-merge main CI run #45799981184, both 3/3 green. |
| Phase 4 — Connected Devices ZIP-only baseline | Done | CI Run 987, SHA `e4598686`; signed ZIP runtime and tenant-scoped discovery baseline. |
| Phase 4 follow-ups — A1 plan migration and A2 host theme bridge | Done | Exact-head CI Run #45795256451, SHA `9b590846b19b2171c4cc101361a748379a2efcf9`; backend, Angular and browser 3/3 green, including migration and theme e2e. |
| Phases 0–2 documentation/architecture corrections | Done | PR #227 merged `5ca53cc`; exact-head CI Run #45802486238 and post-merge main CI Run #45803313494, both backend, Angular and browser 3/3 green. |
| Connected Devices 0.1.5 dashboard | Implemented; CI pending | Native Angular directory updated with four summary metrics, search and status/type filters, cards/table modes, and QR pairing modal. Uses shared primitives in `templates/base/base.css`; no component-local styles. Backend routes and tenant/security model unchanged. Visual checks across six templates and Light/Dark still pending. |
| Phase 5 — Quality gates and bug hunt | NOT started | Out of scope for this task. |
| Phase 6 — Docs and hygiene | NOT started | Out of scope for this task. |
| Human / VPS checks | NOT verified | Owner must rebuild/sign/upload Control Horario `0.2.1` and Connected Devices ZIPs; verify Starter/Pro/Enterprise assignments and existing tenant access; visually inspect Connected Devices in every template/mode. Never delete tenant data. |
| Native Angular plugin runtime | In progress — implementation checkpoint, not deployable | Connected Devices TypeScript, HTML template, component-scoped styles and QR renderer now live in its own remote project; core static registration/component and device-specific Design System selectors removed. Native Federation v3 host/remote, signed ZIP metadata, allowlisted token-protected asset serving, and reload-on-disable/uninstall/update lifecycle are implemented in the branch. The frontend keeps the session-masked catalogue id separate from the stable plugin key for runtime lookup. `apps/web/package-lock.json` now contains all five pinned Native Federation dependencies; it has been inspected statically, but no `npm ci` was run. Runtime grants and protected assets use `private, no-store`; protected asset responses set `Referrer-Policy: no-referrer`. The protected route also maps `.mjs`, WebAssembly, image and font MIME types explicitly under `nosniff`. Browser diagnostics on VPS exposed two bootstrap blockers: the generated classic script contained a static ESM import, and es-module-shims blob modules were denied by CSP. The source bootstrap now uses dynamic imports compatible with the emitted classic script; CSP explicitly permits `blob:` scripts while retaining the per-response nonce and without `unsafe-inline` or `unsafe-eval`. These corrections are committed but NOT yet rebuilt or browser-validated. The next VPS browser report isolated a second startup failure to the legacy QRCode.js global script: its old Android compatibility branch dereferenced top-level `this` (undefined in the module-shim context). The script now guards that obsolete branch and explicitly exposes `QRCode` on `globalThis`, preserving the existing global API. This is a targeted source correction only; the follow-on `@angular/platform-browser` import-map error remains pending VPS verification after the browser bundle is rebuilt. The manual package-release workflow builds the federation remote before invoking the signed ZIP builder. The branch is 20 commits behind `main` in Git ancestry; however, all seven files changed on `main` since the common ancestor have been compared and their current content is present on the feature branch. Final branch comparison is still required before any deployment pull. No tests/builds/CI run by request. The CI workflow skips pull-request jobs originating from this feature branch so validation remains VPS-only. Documents/Files untouched. |

### VPS build feedback — 2026-11-27
- The first VPS Docker build exposed TypeScript narrowing errors in the native federation manifest validation for `remoteName` and `exposedModule`.
- Fixed the runtime manifest guards to explicitly require string values before applying regular expressions or string methods.
- Fix committed to `refactor/native-angular-plugin-runtime` as `1bf07daadff608353c52f5bc45cc24228271fbd0`.
- The VPS frontend build completed, but browser inspection then exposed the two bootstrap/CSP blockers recorded above.
- The bootstrap and CSP corrections are pending VPS rebuild and browser verification. No tests, builds, or GitHub CI were run for this correction.


### VPS browser feedback — 2026-11-27 (follow-up)
- Browser console identified `apps/web/src/assets/qrcode.min.js` as the source of the `_android` exception. The legacy Android canvas workaround accessed top-level `this`, which is undefined when the Angular Native Federation builder loads the scripts bundle as a module shim.
- Guarded the obsolete Android-only workaround for undefined `this` and explicitly assigned the library to `globalThis.QRCode` so existing global consumers retain access.
- Fix committed as `ceb7bd6096219cac6955c0d4744efffba339ec90`.
- The reported `@angular/platform-browser` import-map resolution error is not marked fixed; it must be rechecked after the VPS frontend rebuild. No tests, builds, or GitHub CI were run.
