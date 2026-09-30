# Etridebelt frontend migration: CRA -> Vite

This release replaces Create React App (`react-scripts`) with Vite.

## Why

The previous CRA 5 dependency tree contained many legacy transitive dependencies and produced a large `npm audit` report. The migration removes that toolchain rather than forcing incompatible `npm audit fix --force` upgrades.

## First install on your Mac

From the project root:

```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run typecheck
npm test
npm run build
```

The first `npm install` generates a new `frontend/package-lock.json`. Commit that generated lockfile to source control. Future CI/deploy installs should use:

```bash
npm ci
```

## Run locally

Create `frontend/.env.local`:

```env
VITE_API_URL=http://localhost:5050
```

Then:

```bash
npm start
```

Vite serves the app on `http://localhost:3000`.

## Production

Create `frontend/.env.production` with the real public API URL, then:

```bash
npm run build
```

Deploy the `frontend/dist` directory.
