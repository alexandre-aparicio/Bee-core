| Área | Estado | Evidencia / pendiente |
|---|---|---|
| Core y contrato genérico | Integrado | Baseline de fases anteriores verificado en CI histórica; esta rama mantiene sus cambios aislados. |
| Connected Devices backend | Integrado en paquete | Backend independiente, permisos tenant-scoped, activación manual y ZIP firmado. |
| Connected Devices frontend | Integrado en remoto Angular | Native Federation v3; componente, plantilla, estilos y QR dentro del proyecto remoto. Sin registro feature estático en Core. |
| Carga dinámica | Implementada; VPS pendiente | Outlet genérico valida remoteEntry y monta el componente Angular en el mismo documento. |
| Navegación | Implementada | Rutas del manifiesto se proyectan al catálogo autorizado del tenant y al registro remoto. |
| Seguridad de assets | Implementada; 404 pendiente | Token temporal, allowlist, validación de tenant/usuario/entitlement/instalación/activación y no-store. |
| Diagnóstico VPS | Pendiente | ZIP 0.2.0 monta, pero el remoteEntry protegido devuelve HTTP 404. Diagnóstico seguro añadido; falta desplegarlo y reproducir. |
| GitHub Actions | En corrección | CI reactivada en la rama. Angular build y build backend/paquetes pasaron en la ejecución inspeccionada; tests fallaron por aserciones antiguas y docs fuera de formato. Playwright pendiente de resultado final. |
| Tests | En actualización | Alinear con Native Federation, ZIP 0.2.0 y ausencia de frontend estático en Core; mantener garantías de firma, permisos y seguridad. |
| Documentación | En actualización | Formato de tablas y máximo 40 líneas exigidos por docs-hygiene. |
| VPS / navegador | No verificado | Rebuild, subida/activación tenant, carga real del remoto, estilos y flujo QR pendientes. El 404 no está resuelto. |
| Pull / merge | No hacer todavía | Esperar CI completamente verde y validación del remoto en VPS. |
