| Scope | Status | Evidence / remaining work |
|---|---|---|
| Main CI baseline | Done | Run #45699633886, SHA `73e1f29415dcb91f119ffd2b1f8568efd912a88d`: 3/3 jobs green; backend 123/123; Playwright 31/31; 42 screenshots. |
| Baseline diagnostics | Partial | `docs/main-polish-baseline.md`; browser console errors and TODO/FIXME/HACK count NOT verified (not captured by current gates). |
| Phase 1 — Retire Team Notes | Done | PR CI 45706575499; main CI 45706877532; merge SHA b3aa4c6. |
| Phase 2 — Generic plugin contract | NOT verified | Pending; manifest permissions/services, generic frontend registration, compatibility contract. |
| Phase 3 — Control Horario | Partial | Backend ZIP-only merged on main; behavior matrix and Playwright flow still pending. |
| Phase 4 — Connected Devices | NOT verified | Pending; currently has static backend/frontend registrations. |
| Phase 5 — Quality gates and bug hunt | NOT verified | Pending; console guard, i18n parity, regression coverage and API review. |
| Phase 6 — Docs and hygiene | NOT verified | Pending. |
| Human / VPS checks | NOT verified | Signed ZIP publication, install/upgrade/uninstall/reinstall and tenant isolation require owner VPS. |
