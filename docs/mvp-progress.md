| Scope | Status | Evidence / remaining work |
|---|---|---|
| Main CI baseline | Done | CI Run 987, SHA `e4598686`; ZIP-only Connected Devices merge baseline. |
| Main post-PR #242 regression | Done | Fix `8e10f21`: Playwright tenant-view selector aligned to current `Table view`; no assertion removed. Main CI Run `45984398635`, SHA `dc43d30`, passed 3/3 jobs. |
| Baseline diagnostics | Partial | TODO=0, FIXME=0, HACK=0 verified by CI Run #45802486238; browser console-error guard remains NOT verified. |
| Phase 1 — Retire Team Notes | Done | PR #219 merge `b3aa4c6`; tenant data preserved; CI run #45706575499. |
| Phase 2 — Generic plugin contract | Done | PR #220 merge `d49f7d9`; exact-head CI run #45713713078, 3/3 jobs green. |
| Phase 3 — Control Horario baseline | Done | PR #221 merge `be4d291`; exact-head CI run #45718122238, 3/3 jobs green. Follow-up cleanup/i18n: PR #226 merged `e53f6aa`; exact-head CI run #45799701387 and post-merge main CI run #45799981184, both 3/3 green. |
| Phase 4 — Connected Devices ZIP-only baseline | Done | CI Run 987, SHA `e4598686`; signed ZIP runtime and tenant-scoped discovery baseline. |
| Phase 4 follow-ups — A1 plan migration and A2 host theme bridge | Done | Exact-head CI Run #45795256451, SHA `9b590846b19b2171c4cc101361a748379a2efcf9`; backend, Angular and browser 3/3 green, including migration and theme e2e. |
| Phases 0–2 documentation/architecture corrections | Done | PR #227 merged `5ca53cc`; exact-head CI Run #45802486238 and post-merge main CI Run #45803313494, both backend, Angular and browser 3/3 green. |
| Connected Devices 0.1.5 dashboard | Implemented; CI pending | Native Angular directory updated with four summary metrics, search and status/type filters, cards/table modes, and QR pairing modal. Uses shared primitives in `templates/base/base.css`; no component-local styles. Backend routes and tenant/security model unchanged. Visual checks across six templates and Light/Dark still pending. |\n| Phase 5 — Quality gates and bug hunt | NOT started | Out of scope for this task. |
| Phase 6 — Docs and hygiene | NOT started | Out of scope for this task. |
| Human / VPS checks | NOT verified | Owner must rebuild/sign/upload Control Horario `0.2.1` and Connected Devices ZIPs; verify Starter/Pro/Enterprise assignments and existing tenant access; visually inspect Connected Devices in every template/mode. Never delete tenant data. |
| Native Angular plugin architecture | Documented; migration in progress | ADR and runtime guide define Native Federation for first-party Angular plugins. Connected Devices is the reference; Documents and Control Horario are planned migrations. Legacy iframe remains for isolated HTML/JS packages. |\n