# Platform Settings navigation — Agent 2

**Branch:** `agent-2/platform-settings-navigation`  
**Scope:** Angular dashboard navigation and presentation only.

## Summary

- Replaced the flat Settings destination with one expandable Settings group in all three dashboard shells: Midnight, Glass and Paper.
- Added the eight requested destinations: General, Tenants, Plugins, Integrations, Plans & Licensing, Security, Infrastructure and Localization.
- The Settings group uses one shared expanded-menu state (`expandedMenuId`). Opening it closes any other expandable navigation group; selecting a destination closes the submenu only when navigating away from Settings. Clicking Settings again collapses it.
- Added a section heading, explanatory text, configuration-scope indicator and a consistent placeholder workspace for each destination. These are presentation surfaces; they do not claim to implement the underlying platform APIs or controls.

## Role visibility

| Role | Settings destinations |
|---|---|
| Platform Super Admin (`platformRole === 'superadmin'`) | All eight |
| Tenant owner / admin | General (tenant-scoped description), Plugins, Integrations, Security, Localization |
| Tenant manager | Localization only |
| Standard tenant member | Localization only |

The existing role and active-company context are reused. This change does not grant backend permissions. Direct navigation to a settings route that is not in the current role's visible settings list is rejected back to the dashboard during route synchronization; `navigateSection` also refuses hidden settings IDs.

## Files changed

- `apps/web/src/app/app.component.ts` — settings route registry, role-aware visibility, active submenu state, navigation and section metadata.
- `apps/web/src/app/templates/packages/midnight/pages/dashboard.component.ts`
- `apps/web/src/app/templates/packages/glass/pages/dashboard.component.ts`
- `apps/web/src/app/templates/packages/paper/pages/dashboard.component.ts`
- `docs/platform-settings-navigation.md` — this Agent 2 implementation note.
- `docs/mvp-progress.md` — progress entry.

## Validation

- Source-level review only: checked the three dashboard templates for matching Settings submenu bindings and checked the app navigation methods for role filtering and route handling.
- No unit tests, E2E tests, Angular build, GitHub Actions workflows or deployment checks were run, as requested.
- Visual rendering, Angular compilation and browser behavior remain to be confirmed locally before integration.
- No changes were made to `main`; this work remains isolated on the Agent 2 branch.
