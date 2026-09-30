# Etridebelt – production-ready Todo PWA

Etridebelt is a React/TypeScript PWA with a Vite frontend, Express API, server-side authentication, CSRF protection and offline-first Todo synchronization.

## Architecture

- Frontend: React 18 + TypeScript + Vite 7
- Backend: Node.js 20+ + Express 5
- Authentication: opaque HttpOnly server-side session cookie
- Password storage: Node.js `crypto.scrypt` with per-password random salt
- CSRF: synchronizer token cookie + `X-CSRF-Token` header
- Local offline storage: IndexedDB
- Offline mutations: persistent IndexedDB sync queue
- Server persistence: JSON files for a simple single-instance deployment

The frontend intentionally does not use Create React App or `react-scripts`. Vite is used as the build/development tool, keeping the dependency graph much smaller and avoiding the legacy CRA/Webpack dependency chain.

## Authentication

The API exposes:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

Passwords are never stored in plain text. Sessions are kept server-side and the browser only receives an HttpOnly session cookie.

Every Todo query and mutation requires an authenticated session, and Todo records are isolated by `userId` on the server.

## Important production limitation

The included JSON persistence is suitable for a small single-server deployment, but it is **not a replacement for PostgreSQL/MySQL/etc.** for a multi-instance or high-concurrency production system. For horizontal scaling, move users, sessions and todos to a real transactional database and preferably use a shared session store.

## Environment

### Backend

Copy `backend/.env.example` to your deployment environment and set:

```env
NODE_ENV=production
PORT=5050
CORS_ORIGINS=https://app.example.com
TRUST_PROXY=1
DATA_DIR=/var/lib/etridebelt
```

`DATA_DIR` must be persistent and writable by the application user.

### Frontend

For local development, copy `frontend/.env.example` to `frontend/.env.local`:

```env
VITE_API_URL=http://localhost:5050
```

For production, copy `frontend/.env.production.example` to the deployment environment as `.env.production` and set the public API URL:

```env
VITE_API_URL=https://api.example.com
```

No authentication secret belongs in the frontend environment. Authentication is cookie-based.

## Clean installation

The release intentionally contains no `node_modules`. Install dependencies on the target machine/CI:

```bash
cd backend
npm install
npm test

cd ../frontend
npm install
npm run typecheck
npm test
npm run build
```

Do **not** copy `node_modules` between operating systems or into source control.

After the first clean installation, commit the generated `frontend/package-lock.json` to your repository so CI/deployments can use `npm ci` reproducibly.

## Production deployment

1. Use Node.js 20.19+ for the frontend build and Node.js 20+ for the backend.
2. Deploy the backend on Node.js 20+.
3. Set `NODE_ENV=production`, `CORS_ORIGINS`, `DATA_DIR` and `TRUST_PROXY` as appropriate.
4. Put the API behind HTTPS/reverse proxy.
5. Build the frontend with the production API URL.
6. Serve the generated `frontend/dist` directory as static HTTPS content.
7. Ensure the frontend and API use HTTPS in production. The session cookie is `Secure` and `SameSite=None` in production because the frontend/API may be on different origins.
8. Persist `DATA_DIR` across restarts.
9. Back up the data directory.

## Frontend commands

```bash
npm run dev       # development server on http://localhost:3000
npm run typecheck # TypeScript validation
npm test          # Vitest unit tests
npm run build     # optimized production build in dist/
npm run preview   # preview the production build
```

## Security and dependency hygiene

- Strict CORS allowlist
- HttpOnly session cookie
- Secure/SameSite cookie configuration
- CSRF token validation for state-changing requests
- Password hashing with `crypto.scrypt`
- Request body limit
- Per-IP/path rate limiting for authentication and writes
- Server-side Todo validation
- No API response caching
- Security headers
- Graceful shutdown
- No `react-scripts`, legacy CRA Webpack toolchain or Jest 27 dependency tree

Run dependency auditing before each production release:

```bash
npm audit
```

Do not use `npm audit fix --force` blindly; it can introduce breaking dependency changes.

## Offline behavior

IndexedDB stores the current user's Todo data locally. Failed create/update/delete operations are persisted in a sync queue and retried when connectivity returns.

Local data and pending operations are cleared when a different account signs in or the current account signs out, preventing one user's offline data from being displayed to another account on the same browser.

Authenticated users are never seeded with the public demo Todo data.

## Validation status

This packaging environment does not have reliable npm registry access, so a fresh dependency installation and final Vite build could not be executed here. The package configuration and source migration have been checked, backend/service-worker JavaScript passes syntax checks, and JSON configuration files are valid. Run `npm install`, `npm run typecheck`, `npm test` and `npm run build` on the target machine/CI and commit the generated lockfile before production deployment.
