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
| Control Horario frontend ZIP-only migration | In progress | Branch `refactor/frontend-fully-decoupled`; signed ZIP frontend, role-aware route metadata, generic host navigation and bounded iframe resizing are integrated. Angular frontend and static registration removed; Documents remains native/Files-backed and untouched. Exact-head CI #1064 passed: 153/153 backend tests, 34 browser tests, Angular production build green. VPS signing/install and manual visual checks remain pending. See `docs/time-tracking-frontend-zip-migration.md`. |
| Phase 5 — Quality gates and bug hunt | NOT started | Out of scope for this task. |
| Phase 6 — Docs and hygiene | NOT started | Out of scope for this task. |
| Human / VPS checks | NOT verified | Owner must build/sign/upload Control Horario `0.2.2` on the VPS; verify Starter/Pro/Enterprise assignments and existing tenant access; visually inspect Control Horario in supported templates/modes. Connected Devices and Documents must remain unchanged. Never delete tenant data. |
