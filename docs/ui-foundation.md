# Bee-Core UI foundation

Initial responsive web shell for Bee-Core public website and private dashboard.

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Lucide icons
- Mobile-first landing page, login screen and protected dashboard shell
- Auth client uses POST /auth/login with client=dashboard and stores the current access/refresh pair locally
- Dashboard currently displays starter runtime information; plugin registry API integration is next.
- Password recovery and self-registration are intentionally not wired because API endpoints are not implemented yet.

Run locally:
```bash
cd apps/web
npm install
npm run dev
```

Set VITE_BEE_API to the Bee-Core API base URL. For local dev, default is same-origin; set it to http://localhost:3000 if API runs separately.
