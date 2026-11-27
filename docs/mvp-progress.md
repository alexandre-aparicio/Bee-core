| Área | Estado | Evidencia / pendiente |
|---|---|---|
| Core y contrato genérico | Integrado | Baseline de fases anteriores verificado en CI histórica; esta rama mantiene sus cambios aislados. |
| Connected Devices backend | Integrado en paquete | Backend independiente, permisos tenant-scoped, activación manual y ZIP firmado. |
| Connected Devices frontend | Integrado en remoto Angular | Native Federation v3; componente, plantilla, estilos y QR dentro del proyecto remoto. Sin registro feature estático en Core. |
| Carga dinámica | Implementada; VPS pendiente | Outlet genérico valida remoteEntry y monta el componente Angular en el mismo documento. |
| Navegación | Implementada | Rutas del manifiesto se proyectan al catálogo autorizado del tenant y al registro remoto. |
| Seguridad de assets | Implementada; 404 pendiente | Token temporal, allowlist, validación de tenant/usuario/entitlement/instalación/activación y no-store. |
| Diagnóstico VPS | Pendiente | ZIP 0.2.0 monta, pero el remoteEntry protegido devuelve HTTP 404. Diagnóstico seguro añadido; falta desplegarlo y reproducir. |
| GitHub Actions | En validación | Build Angular y backend verdes. Playwright ya arranca Native Federation y la prueba Connected Devices pasa; 32/34 tests pasaron en el último resultado. Corregidos dos fixtures/locators obsoletos: EventSource ahora recibe 204 SSE y Tenants usa el nombre actual `Table view`. CI del commit correctivo pendiente. |
| Tests | En validación | Sin desactivar aserciones: corregido el `module-shim` del servidor estático; el stream de plantillas se simula con 204 (cierre SSE válido) y el selector de tabla se alinea con la UI actual. Esperando reejecución completa. |
| Documentación | En actualización | Formato de tablas y máximo 40 líneas exigidos por docs-hygiene. |
| VPS / navegador | No verificado | Rebuild, subida/activación tenant, carga real del remoto, estilos y flujo QR pendientes. El 404 no está resuelto. |
| Pull / merge | No hacer todavía | Esperar CI completamente verde y validación del remoto en VPS. |
