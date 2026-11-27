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
| Connected Devices 0.1.5 dashboard | Implemented; CI pending | Native Angular directory updated with four summary metrics, search and status/type filters, cards/table modes, and QR pairing modal. Uses shared primitives in `templates/base/base.css`; no component-local styles. Visual checks across six templates and Light/Dark still pending. Backend routes and tenant/security model unchanged. |
| Phase 5 — Quality gates and bug hunt | NOT started | Out of scope for this task. |
| Phase 6 — Docs and hygiene | NOT started | Out of scope for this task. |
| Human / VPS checks | NOT verified | Owner must rebuild/sign/upload Control Horario `0.2.1` and Connected Devices ZIPs; verify Starter/Pro/Enterprise assignments and existing tenant access; visually inspect Connected Devices in every template/mode. Never delete tenant data. |
| Native Angular plugin runtime | In progress — implementation checkpoint, not deployable | Connected Devices TypeScript, HTML template, component-scoped styles and QR renderer now live in its own remote project; core static registration/component and device-specific Design System selectors removed. Native Federation v3 host/remote, signed ZIP metadata, allowlisted token-protected asset serving, and reload-on-disable/uninstall/update lifecycle are implemented in the branch. The frontend keeps the session-masked catalogue id separate from the stable plugin key for runtime lookup. Runtime grants and protected assets use `private, no-store`; protected asset responses set `Referrer-Policy: no-referrer`. The protected route also maps `.mjs`, WebAssembly, image and font MIME types explicitly under `nosniff`. Browser diagnostics on VPS exposed bootstrap/CSP and legacy QRCode module-shim blockers; source corrections are committed but require VPS browser verification. The subsequent import-map issue remains subject to VPS verification after rebuilding the host bundle. The manual package-release workflow builds the federation remote before invoking the signed ZIP builder. The branch is 20 commits behind `main` in Git ancestry; however, all seven files changed on `main` since the common ancestor have been compared and their current content is present on the feature branch. Final branch comparison is still required before any deployment pull. No tests/builds/CI run by request. The CI workflow skips pull-request jobs originating from this feature branch so validation remains VPS-only. Documents/Files untouched. |

### VPS build feedback — 2026-11-27
- The first VPS Docker build exposed TypeScript narrowing errors in the native federation manifest validation for `remoteName` and `exposedModule`.
- Fixed the runtime manifest guards to explicitly require string values before applying regular expressions or string methods.
- Fix committed to `refactor/native-angular-plugin-runtime` as `1bf07daadff608353c52f5bc45cc24228271fbd0`.
- The VPS frontend build completed, but browser inspection then exposed bootstrap/CSP blockers recorded below.

### VPS browser feedback — 2026-11-27
- Browser console identified `apps/web/src/assets/qrcode.min.js` as the source of the `_android` exception. The legacy Android canvas workaround accessed top-level `this`, which is undefined when the Angular Native Federation builder loads the scripts bundle as a module shim.
- Guarded the obsolete Android-only workaround for undefined `this` and explicitly assigned the library to `globalThis.QRCode` so existing global consumers retain access.
- Fix committed as `ceb7bd6096219cac6955c0d4744efffba339ec90`.
- The reported `@angular/platform-browser` import-map resolution error was not marked fixed; it must be rechecked after the VPS frontend rebuild.

### VPS federation bootstrap diagnosis — 2026-11-27
- VPS output confirms `remoteEntry.json`, `importmap.json`, and the shared `@angular/platform-browser` bundle all exist and return HTTP 200; missing shared metadata/assets are therefore not the cause of the reported bare-specifier resolution failure.
- The served `index.html` showed the federation-generated `main-*.js` entry as a classic `<script>`, while the builder-generated `scripts-*.js` bundle was `type="module-shim"`. The main entry uses dynamic `import()`, which in a classic script follows the browser's native module resolver rather than es-module-shims' shim import map.
- Added a narrowly scoped Nginx HTML substitution for the generated `<script src="main-...` tag, converting it to `type="module-shim"`. It preserves the hashed filename, existing script body, CSP nonce substitution, and strict CSP policy.
- Commit: `3295d0e5dff63d36dcb50ff0b176b0bff4289775`. Source correction only; VPS rebuild and browser verification remain pending.

### VPS plugin package build diagnosis — 2026-11-27
- The first `npm run build:plugin-packages` attempt compiled the backend successfully, then failed because the Angular CLI was not installed in `apps/web/node_modules`. Installing the pinned web dependencies with `npm ci` exposed two workspace-boundary defects in the remote build.
- The remote's federation config is loaded by Node from `plugins/connected-devices/frontend`, outside the web workspace's `node_modules`; its exposed module path is also interpreted relative to the Angular workspace root (`apps/web`), not relative to the config file.
- Updated `federation.config.js` to resolve the Native Federation config package from `apps/web` and to expose the plugin component using its workspace-root-relative path.
- Updated the remote `tsconfig.app.json` with a workspace-root `baseUrl` and package path mapping so TypeScript resolves Angular and Native Federation packages from the existing `apps/web/node_modules`, without copying or installing a second Angular runtime into the plugin.
- Commits: `924ce6ce93ba99f352bffe0944c27068b3ddc29d` and `cc4a13d22f43cbb5b931269a53ea123c322d2520`.
- These are source/configuration corrections only. No tests, builds, or GitHub Actions/CI were run. VPS must pull the branch and retry `npm run build:plugin-packages`; successful compilation, ZIP contents, signature verification, upload and tenant activation are still NOT verified.


### Connected Devices remote TypeScript entry inclusion — 2026-11-27
- VPS retry after the federation path/configuration fixes compiled the backend and reached Angular Federation, then stopped because `src/plugin.component.ts` was exposed by Federation but was not part of the remote TypeScript program (`tsconfig.app.json` only listed `src/main.ts`).
- Updated `plugins/connected-devices/frontend/tsconfig.app.json` to include both `src/main.ts` and `src/plugin.component.ts` in `files`. The exposed entry can now be type-checked as part of the remote build; its imported component remains resolved through the normal TypeScript dependency graph.
- Commit: `e6c6ed696d40f084fa89a7b6322f8209fb7f6fc1`.
- Source/configuration correction only. No tests, builds, or GitHub workflows were run. VPS build, ZIP generation, signature verification, upload, and tenant activation remain unverified.


### Connected Devices QR loader typing — 2026-11-27
- VPS retry now passes the previous federation-entry inclusion error and reaches Angular template/type compilation. The build stops on three TypeScript errors in the QR library loader: an untyped `new Promise` inferred `unknown`, resolving without an explicit `void`, and returning a possibly undefined module-level promise.
- Updated `loadQrLibrary()` to construct a `Promise<void>`, hold it in a local constant, assign that constant to the shared cache, and return the non-optional local promise. Failure still clears the shared cache so a later attempt can retry.
- Angular also emitted four NG8107 optional-chain warnings in the template. They are warnings, not the build-stopping errors, and are not changed in this correction.
- Commit: `ed3cca83f4ae8c81c400865800c9db49cdbcf6db`.
- Source correction only; no tests, builds, or GitHub workflows were run. VPS compilation and package/signature generation remain unverified.
