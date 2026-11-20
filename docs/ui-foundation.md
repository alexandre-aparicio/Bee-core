# Bee-Core Angular UI

The public site, dashboard shell and auth screens use a standalone Angular application.

## Stack
- Angular 19 + TypeScript + Angular Forms
- Angular CLI production build
- Playwright Chromium smoke tests
- Mobile-first responsive CSS (ported from the former React UI)
- Nginx static hosting and API reverse proxy

## Views
- `/`: public landing page
- `/login`: POST `/auth/login` using dashboard client
- `/register`: request-access placeholder (backend registration is not implemented)
- `/forgot`: password recovery placeholder (backend recovery is not implemented)
- `/dashboard`: private dashboard shell; demo metrics and plugin listing are static


## Local development
```sh
cd apps/web
npm install
npm start
```

## Checks
```sh
npm run build
npm run test:e2e
```
Docker builds Angular assets and serves them through Nginx. Live dashboard registry metrics and token-refresh UX are not implemented yet.
