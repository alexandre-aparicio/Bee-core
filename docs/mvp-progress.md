| Área | Estado | Evidencia / pendiente |
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
| Connected Devices 0.1.5 dashboard | Implemented; CI pending | Native Angular directory updated with four summary metrics, search and status/type filters, cards/table modes, and QR pairing modal. Uses shared primitives in `templates/base/base.css`; no component-local styles. Visual checks across six templates and Light/Dark still pending. |
| Phase 5 — Quality gates and bug hunt | NOT started | Out of scope for this task. |
| Phase 6 — Docs and hygiene | NOT started | Out of scope for this task. |
| Human / VPS checks | NOT verified | Owner must rebuild/sign/upload Control Horario `0.2.1` and Connected Devices ZIPs; verify Starter/Pro/Enterprise assignments and existing tenant access; visually inspect Connected Devices in every template/mode. Never delete tenant data. |
| Native Angular plugin architecture | Documented; migration in progress | ADR and runtime guide define Native Federation for first-party Angular plugins. Connected Devices is the reference; Documents and Control Horario are planned migrations. Legacy iframe remains for isolated HTML/JS packages. |

| Integración Native Federation (candidata) | En validación | Estado de la integración con main; pendiente completar pruebas y CI. |

| Área | Estado | Evidencia / pendiente |
|---|---|---|
| Core y contrato genérico | Implementación en la rama candidata | Shell, auth, tenant context, navegación y outlet genérico permanecen en Core. La integración con el `main` actualizado debe validarse antes de considerarla completada. |
| Connected Devices backend | Implementación en paquete | Backend independiente, permisos tenant-scoped, activación manual y ZIP firmado. Pendiente validación integrada y despliegue real. |
| Connected Devices frontend | Native Federation implementado en la rama | Remote Angular separado; comparte Angular singleton con el host y expone `./Component`. Pendiente build y pruebas sobre la integración con `main`. |
| Carga dinámica | Implementada en la rama; VPS pendiente | Outlet valida remoteEntry v3 y monta el componente en el mismo documento. Debe verificarse la entrega real del remoteEntry protegido. |
| Navegación | Implementada en la rama | Rutas del manifiesto se proyectan al catálogo autorizado del tenant. Pendiente regresión integrada. |
| Seguridad de assets | Implementada en la rama; 404 pendiente | Token temporal, allowlist, validación de tenant/usuario/entitlement/instalación/activación y no-store. ZIP Connected Devices 0.2.0: remoteEntry protegido devolvió HTTP 404 en el diagnóstico previo; falta reproducir tras despliegue. |
| Control Horario backend | ZIP firmado | Versión 0.2.2; conservar migraciones y datos tenant-scoped. |
| Control Horario frontend | Migración planificada | Retirar registro Angular estático y crear remote Native Federation en `plugins/time-tracking/frontend`. |
| Documents backend | Migración en curso | ZIP y runtime común; retirar fallback bundled solo tras publicación y verificación real. |
| Documents frontend | Migración planificada | Crear remote Native Federation en `plugins/documents/frontend`; preservar ACL, publicaciones y blobs. |
| Hola Mundo | Ejemplo legacy | ZIP con HTML/JS en iframe sandbox; no es patrón para módulos Angular first-party. |
| CI rama Native Federation | Verde en ejecución previa; integración con main no verificada | La ejecución previa de la rama no sustituye a las pruebas de esta integración. Confirmar SHA y jobs en GitHub antes de darla por válida. |
| CI main | Verde en ejecución previa | Commit `dc43d30`; backend, Angular y Playwright completados correctamente. |
| Integración de rama con main | En validación aislada | Esta fila solo podrá actualizarse tras resolver conflictos, ejecutar las pruebas integradas y obtener CI verde sobre el commit candidato. |
| VPS / navegador | No verificado | Carga real, navegación, estilos, QR y flujos críticos pendientes. |
| Migración de Documents y Control Horario | Planificada | No migrar hasta validar Connected Devices en producción y acordar la secuencia de migración. |

| Verificación backend 27/11/2026 | PASS local | 157/157 tests con Node 22.22.3 y MongoDB 9.0.8; detalle en `docs/backend-validation-2026-11-27.md`. |
| CI integración PR #244, run #1300 | FAIL | Host/remote Angular, ruta de salida Playwright y límite documental; correcciones en curso. |
