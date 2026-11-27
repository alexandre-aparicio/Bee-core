# Estado MVP y verificación de integración

## Base consolidada
- Main CI baseline: PR #219–#227 integrados; regresiones posteriores verificadas en CI.
- Contrato genérico de plugins y aislamiento tenant-scoped: implementados y cubiertos por pruebas.
- Connected Devices ZIP-only baseline y migración de asignaciones heredadas: verificados antes de Native Federation.
- ADR: Native Federation es el patrón para plugins Angular first-party; HTML/JS aislado conserva iframe.
- Documents y Control Horario: sus backends siguen como paquetes firmados; su migración frontend a Native Federation no forma parte de este PR.

## PR #244 — Native Federation y Angular 22
- Rama: `integration/full-stack-modernization`.
- HEAD revisado: `1651470bd0c0fbb90280ce6a2583f726202acc93`.
- Base: `main` en `8115b5218003b1b5522f24ac1ea4103915fcbe91`; comparación: 195 commits ahead, 0 behind.
- CI #1308, ejecución sobre el merge ref del HEAD actual: 3/3 jobs correctos.
- Backend: 157 tests passed, 0 failed, 0 skipped; MongoDB 8 en servicio Docker de CI.
- Angular: instalación limpia `npm ci`, build de producción del host y build del remote Connected Devices correctos.
- Paquetes: build de los cuatro ZIP firmados y pruebas de instalación/verificación de firma, manifiesto, backend y assets correctas.
- Marketplace: pruebas de integración cubren concesión/aislamiento tenant, instalación, activación, desactivación, desinstalación, actualización y auditoría.
- Playwright: 34/34 correctos; incluye carga del remote Native Federation real, listado, filtros, vistas y DELETE sin body.
- Capturas de seis plantillas en claro/oscuro publicadas como artefacto CI `bee-core-template-screenshots`.
- Diff revisado: 85 archivos; sin conflictos reportados, sin comentarios ni hilos de revisión pendientes.
- El E2E del remote simula API y entrega de assets protegidos; no acredita el endpoint real tras Nginx en el VPS.
- La revisión de configuración Nginx/CSP es estática; no equivale a una comprobación HTTP en despliegue.

## Pendiente fuera de CI
- Validar en un entorno VPS/staging el upload del ZIP firmado con la clave real, montaje runtime, remoteEntry/assets protegidos y headers CSP/Nginx.
- Comprobar navegación y estilos de Connected Devices en los seis temas y ambos modos en el despliegue real.
- Confirmar asignaciones Starter/Pro/Enterprise y acceso de tenants existentes sin modificar ni borrar datos.
- No se ha desplegado ni se ha alterado producción. No marcar el despliegue como verificado hasta completar estas comprobaciones.

## Otras validaciones
- Backend local 27/11/2026: 157/157 con Node 22.22.3 y MongoDB 9.0.8; detalle en `docs/backend-validation-2026-11-27.md`.
- Phase 5 (quality gates/bug hunt) y Phase 6 (docs/hygiene) siguen fuera del alcance de este PR.
