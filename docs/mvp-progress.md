| Área | Estado | Evidencia / pendiente |
|---|---|---|
| Core y contrato genérico | Integrado | Shell, auth, tenant context, navegación y outlet genérico permanecen en Core. |
| Connected Devices backend | Integrado en paquete | Backend independiente, permisos tenant-scoped, activación manual y ZIP firmado. |
| Connected Devices frontend | Native Federation implementado | Remote Angular separado; comparte Angular singleton con el host y expone `./Component`. |
| Carga dinámica | Implementada; VPS pendiente | Outlet valida remoteEntry v3 y monta el componente en el mismo documento. |
| Navegación | Implementada | Rutas del manifiesto se proyectan al catálogo autorizado del tenant. |
| Seguridad de assets | Implementada; 404 pendiente | Token temporal, allowlist, validación de tenant/usuario/entitlement/instalación/activación y no-store. |
| Control Horario backend | ZIP firmado | Versión 0.2.2; conservar migraciones y datos tenant-scoped. |
| Control Horario frontend | Migración planificada | Retirar registro Angular estático y crear remote Native Federation en `plugins/time-tracking/frontend`. |
| Documents backend | Migración en curso | ZIP y runtime común; retirar fallback bundled solo tras publicación y verificación real. |
| Documents frontend | Migración planificada | Crear remote Native Federation en `plugins/documents/frontend`; preservar ACL, publicaciones y blobs. |
| Hola Mundo | Ejemplo legacy | ZIP con HTML/JS en iframe sandbox; no es patrón para módulos Angular first-party. |
| CI rama Native Federation | Verde | Commit `4dcf2b6`; backend, Angular y Playwright completados correctamente. |
| CI main | Verde | Commit `dc43d30`; backend, Angular y Playwright completados correctamente. |
| Diagnóstico VPS | Pendiente | ZIP Connected Devices 0.2.0: remoteEntry protegido devuelve HTTP 404; falta reproducir tras despliegue. |
| VPS / navegador | No verificado | Carga real, navegación, estilos, QR y flujos críticos pendientes. |
| Pull / merge | No hacer todavía | Esperar corrección del 404 y validación real en VPS; después migrar Documents y Control Horario. |
