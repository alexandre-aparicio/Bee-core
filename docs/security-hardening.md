# Frontend security hardening

## Scope

This work tracks the frontend dependency remediation for `apps/web`. The acceptance gate is:

1. Move Angular off the unsupported 19.2 line using the official sequential migrations (19 → 20 → 21 → 22), selecting mutually compatible stable Angular, CLI, build, compiler and TypeScript versions.
2. Use a Node.js version satisfying the selected Angular release in local development and the `apps/web/Dockerfile` build stage. Do not assume that a floating `node:22-alpine` tag satisfies a minimum patch requirement.
3. Regenerate `apps/web/package-lock.json` with npm from the final manifest; never hand-edit lockfile dependency graphs.
4. Run `npm ci`, `npm run audit:production`, `npm run build` and `npm run test:e2e` from `apps/web`.
5. Verify the app in headless Chromium, including login, dashboard and public/dashboard theme selection.

## Reproducible production audit

From `apps/web`:

```sh
npm ci
npm run audit:production
```

The `audit:production` script is a convenience wrapper for `npm audit --omit=dev`. It does not replace the full development-dependency audit when that is required.

## Current status

**Not resolved yet.** The branch currently contains Angular 19.2.15 in both `package.json` and `package-lock.json`. The manifest now exposes the production audit command, but this alone does not remediate vulnerable packages.

The dependency migration and lockfile regeneration require executing the Angular CLI and npm against the repository. GitHub file-edit operations cannot safely reproduce npm's resolved dependency graph or run the production build and browser acceptance checks. Do not mark this work complete until the checks above have actually passed.

## Constraints

- Keep this work on `security/hardening-92`; do not merge it into `main` or open a pull request without explicit authorization.
- Do not use GitHub Actions as a substitute for local verification.
- Do not weaken tests, compiler checks, lint rules or audit severity.
- Do not use `--force` or `--legacy-peer-deps` to bypass dependency conflicts.
- Do not claim a clean audit, successful build or browser verification without captured command output.
