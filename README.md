# Campaign Frontend (Internal Admin/Test GUI)

Internal React SPA to test and administrate the `ooehme/campaign-backend` Laravel API.

## Project overview

This frontend provides direct CRUD access to campaigns, areas, teams, team memberships, tasks, and task events. It is intentionally simple and token-based for internal usage.

## Tech stack

- React + TypeScript
- Vite
- TanStack Query
- React Router
- React Hook Form + Zod
- Tailwind CSS
- Leaflet + React-Leaflet

## Backend API URL

- Production backend: `https://backend.oliveroehme.de`

## Production deployment target

- Planned frontend domain: `https://frontend.oliveroehme.de`

## Environment variables

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Variables:

- `VITE_API_BASE_URL` (e.g. `https://backend.oliveroehme.de`)
- `VITE_API_TOKEN` (Laravel Sanctum bearer token)

## Local setup

```bash
npm install
npm run dev
```

## Development commands

```bash
npm run dev
npm run build
npm run preview
```

## Plesk deployment notes

This project is a Vite SPA.

1. Build with:

   ```bash
   npm install
   npm run build
   ```

2. Deploy **only** the built `dist/` contents to the document root of `frontend.oliveroehme.de`.
3. Ensure direct route fallback is configured (see `public/.htaccess`).
4. Do **not** expose `.env`, `node_modules`, source files, or `.git` publicly.

## Apache/Plesk SPA fallback

`public/.htaccess` rewrites non-file and non-directory requests to `/index.html`, enabling direct navigation to nested React routes.

## Scope intentionally not implemented

- Real login flow
- Refresh token flow
- Role-based UI permissions
- Advanced map drawing/editing
- Backend code changes
- CI/CD pipeline
