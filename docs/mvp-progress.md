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


### First successful Connected Devices package build — 2026-11-27
- VPS ran `npm run build:plugin-packages` successfully after the QR loader typing correction. Backend TypeScript compilation and the Angular Native Federation remote build completed; the package script emitted ZIPs for Connected Devices, Time Tracking, Hello World, and Documents.
- Connected Devices artifact reported by the VPS: `artifacts/plugin-packages/connected-devices-0.2.0.zip`, 612,217 bytes, 108 files, SHA-256 `fa8d75ab00c3dd8da0d67b4ecb2700d3d7441886fb4f289ddb591413309a8e46`. This is a build-script report, not yet an independent ZIP-content or signature verification.
- Angular emitted four NG8107 warnings caused by optional chaining on properties typed as non-nullable. Updated the Connected Devices template to remove those redundant optional chains for `device.grantedCapabilities.length` and the pending-device grant map lookups.
- Warning cleanup commit: `2ab89e4cddc0a310076a9eb61c68ddf94a1156a8`.
- The first package build is successful. Warning-free rebuild, ZIP inspection, cryptographic signature verification, upload/installation, tenant entitlement activation, runtime loading, and final VPS validation remain pending. Do not merge to `main` until these release gates are completed.

### VPS native remote-entry failure — 2026-11-27
- The installed Connected Devices ZIP contains both `frontend/remoteEntry.json` (19.8 KB) and `frontend/importmap.json` (5.0 KB), and the backend logs confirm that package `0.2.0` mounted successfully. The browser nevertheless reports HTTP 404 followed by Native Federation's opaque `exposes is not iterable` exception.
- The v3 loader assumes the remote-entry fetch succeeded and immediately iterates `exposes`; when the protected asset endpoint returns its JSON 404 body, the loader reports a misleading schema TypeError. The host now performs a no-store, credential-free preflight, checks HTTP status, and validates the v3 `name`, `exposes[]`, exposed key, and `shared[]` contract before calling `loadRemoteModule`.
- The signed package builder now validates the same remote-entry contract before including the federation output in a ZIP, preventing malformed or incompatible remotes from being released.
- Commits: `7cc04cec9f246056341cadd76ddcc2b69ec3eb23` and `3840d7c933243f1891195ee123e734b549486a3c`.
- These are source changes only. No tests, builds, or GitHub Actions/CI were run. The HTTP 404 authorization/path cause is not yet identified; the new host error will expose the actual HTTP status rather than the misleading `exposes` TypeError. VPS pull, package rebuild/re-sign/re-upload, and browser verification remain pending. Do not merge to `main`.

### Protected Connected Devices asset 404 — 2026-11-27
- VPS logs confirm the connected-devices@0.2.0 ZIP package mounts and reaches runtime state loaded; the existing asset route returned generic 404 responses without logging which authorization, manifest, or filesystem check failed.
- Added safe server-side denial diagnostics to the token-protected asset route. Logs include plugin/version/asset path and boolean authorization-check outcomes, but never log the bearer token or tenant/user/session identifiers. All external denials retain the same generic 404 response.
- Corrected the protected route's path-validation escaping while adding the diagnostics; the version regex now matches semantic-version digits and the traversal checks test a literal backslash and NUL correctly.
- Commits: 0a36fc24b6c2b461ce62bd622117ec464caf787f (diagnostic instrumentation) and 2a8195e1633085e8bf59aaf16d1b3525faa5dd48 (path-validation escaping correction).
- Source changes only. No tests, builds, or GitHub Actions/CI were run. Pull/rebuild the backend on the VPS and reproduce one request; use the resulting Protected plugin asset request denied reason to apply the final authorization/path fix. Do not merge to main.

### GitHub CI reactivation and validation — 2026-11-27
- At the user's request, re-enabled GitHub Actions validation for `refactor/native-angular-plugin-runtime`: added the branch to the CI push trigger and removed the conditional that skipped pull-request validation for this branch.
- Playwright initially exposed an invalid dev-server invocation (the Native Federation builder does not accept the generic `--host` argument). Updated the Playwright webServer command to use Angular's `serve-original` target.
- The next run exposed that the base Angular build target had no explicit `development` configuration. Added a development configuration with optimization disabled and source maps enabled.
- Commits: CI trigger/skip correction (see branch history), Playwright server correction (see branch history), and `0b228c3adb90b0c31d1ae800e4dea82fbe7e4409` (Angular development build configuration).
- GitHub Actions run [#45970806834](https://github.com/alexandre-aparicio/Bee-core/actions/runs/45970806834), commit `0b228c3`, is currently in progress. At the last inspection, backend build, Connected Devices federation remote build, Documents signed package generation, backend tests, Angular production build, and browser smoke/template tests were running or had completed their prerequisite steps; no job had yet reported a failure in this run.
- An earlier run exposed the Playwright server startup issue and failed its browser job; its backend build and federation/package-generation steps passed, but that run was superseded and did not complete all checks. The current run must finish with every required job green before calling CI passed.
- CI is now active on the feature branch. This does not constitute verification of the live VPS asset endpoint or the protected asset 404; those remain separate deployment/runtime gates. Do not merge to `main`.
