| Área | Estado | Evidencia / pendiente |
|---|---|---|
| Core y contrato genérico | Integrado | Baseline de fases anteriores verificado en CI histórica; esta rama mantiene sus cambios aislados. |
| Connected Devices backend | Integrado en paquete | Backend independiente, permisos tenant-scoped, activación manual y ZIP firmado. |
| Connected Devices frontend | Integrado en remoto Angular | Native Federation v3; componente, plantilla, estilos y QR dentro del proyecto remoto. Sin registro feature estático en Core. |
| Carga dinámica | Implementada; VPS pendiente | Outlet genérico valida remoteEntry y monta el componente Angular en el mismo documento. |
| Navegación | Implementada | Rutas del manifiesto se proyectan al catálogo autorizado del tenant y al registro remoto. |
| Seguridad de assets | Implementada; 404 pendiente | Token temporal, allowlist, validación de tenant/usuario/entitlement/instalación/activación y no-store. |
| Diagnóstico VPS | Pendiente | ZIP 0.2.0 monta, pero el remoteEntry protegido devuelve HTTP 404. Diagnóstico seguro añadido; falta desplegarlo y reproducir. |
| GitHub Actions | Pendiente de reejecución | En el último CI inspeccionado, build Angular, backend y remoto pasaron; Playwright falló al resolver Angular. Corregido el servidor estático de pruebas para aplicar el mismo `module-shim` que Nginx. Falta ejecutar CI sobre este cambio. |
| Tests | En validación | Suite Playwright conserva las aserciones funcionales y de seguridad. La causa de arranque detectada era una diferencia entre servidor de pruebas y Nginx; resultado tras la corrección aún no verificado. |
| Documentación | En actualización | Formato de tablas y máximo 40 líneas exigidos por docs-hygiene. |
| VPS / navegador | No verificado | Rebuild, subida/activación tenant, carga real del remoto, estilos y flujo QR pendientes. El 404 no está resuelto. |
| Pull / merge | No hacer todavía | Esperar CI completamente verde y validación del remoto en VPS. |
