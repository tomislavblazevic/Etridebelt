# Etridebelt – production-ready Todo PWA

Etridebelt is a React/TypeScript PWA with an Express API, server-side authentication, CSRF protection and offline-first Todo synchronization.

## Architecture

- Frontend: React 18 + TypeScript + Create React App
- Backend: Node.js 20+ + Express 5
- Authentication: opaque HttpOnly server-side session cookie
- Password storage: Node.js `crypto.scrypt` with per-password random salt
- CSRF: synchronizer token cookie + `X-CSRF-Token` header
- Local offline storage: IndexedDB
- Offline mutations: persistent IndexedDB sync queue
- Server persistence: JSON files for a simple single-instance deployment

## Authentication

The API exposes:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

Passwords are never stored in plain text. Sessions are kept server-side and the browser only receives an HttpOnly session cookie.

Every Todo query and mutation requires an authenticated session, and Todo records are isolated by `userId` on the server.

### Important production limitation

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

Create `frontend/.env.production` (do not commit secrets):

```env
REACT_APP_API_URL=https://api.example.com
```

No authentication secret belongs in the frontend environment. Authentication is cookie-based.

## Clean installation

The original project archive contained a broken/incomplete `node_modules`. It has deliberately been removed from this release. Always install dependencies from the lockfiles on the target machine/CI:

```bash
cd backend
npm ci
npm test

cd ../frontend
npm ci
npm run build
```

Do **not** copy `node_modules` between operating systems or into source control.

## Production deployment

1. Deploy the backend on Node.js 20+.
2. Set `NODE_ENV=production`, `CORS_ORIGINS`, `DATA_DIR` and `TRUST_PROXY` as appropriate.
3. Put the API behind HTTPS/reverse proxy.
4. Build the frontend with the production API URL.
5. Serve the generated `frontend/build` directory as static HTTPS content.
6. Ensure the frontend and API use HTTPS in production. The session cookie is `Secure` and `SameSite=None` in production because the frontend/API may be on different origins.
7. Persist `DATA_DIR` across restarts.
8. Back up the data directory.

## Security notes

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

## Offline behavior

IndexedDB stores the current user's Todo data locally. Failed create/update/delete operations are persisted in a sync queue and retried when connectivity returns.

Local data and pending operations are cleared when a different account signs in or the current account signs out, preventing one user's offline data from being displayed to another account on the same browser.

## Validation status of this release

The backend and service worker JavaScript files pass Node syntax checks. The TypeScript sources were statically inspected, but a complete React production build cannot be performed in this packaging environment because npm registry/package tarballs are not available reliably here. The release therefore intentionally contains no `node_modules`; `npm ci` on a normal CI/deployment machine is the authoritative dependency installation step.
