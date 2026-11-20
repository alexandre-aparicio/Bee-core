# Bee-Core UI foundation

Responsive first release of the public site, private dashboard shell and authentication screens.

## Stack
- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Lucide React icons
- Nginx container for static UI hosting and reverse proxying
- Mobile-first layout overrides and touch-friendly auth form controls

## Routes
- `/`: public landing page
- `/login`: dashboard sign-in (POST `/auth/login`, client `dashboard`)
- `/register`: request-access placeholder (self-service registration API is not implemented)
- `/forgot`: password recovery placeholder (recovery API is not implemented)
- `/dashboard`: private starter dashboard shell (currently local auth-session presence check; registry metrics are static starter data)

## Auth integration
Login stores the access/refresh token response in local storage under `bee-auth`. Logout removes the local session. Registration and recovery are visual entry points only until corresponding backend endpoints are added. The dashboard's complete token validation, refresh/retry flow and live plugin registry data are follow-up tasks.

## Local development
```bash
cd apps/web
npm install
npm run dev
```
Set `VITE_BEE_API` to the backend API origin. When running behind the compose Nginx proxy, the default is `/api`.
