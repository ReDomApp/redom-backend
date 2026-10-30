# Aurelink React

Independent React + TypeScript user-facing Aurelink account application.

## Local development
```bash
pnpm install --no-frozen-lockfile
pnpm --filter @workspace/aurelink-react dev
```

## Production build
```bash
pnpm --filter @workspace/aurelink-react run typecheck
pnpm --filter @workspace/aurelink-react run build
```

The Vite output is `dist/`. The app calls the existing Aurelink authentication endpoints on the ReDom backend. It does not import, copy, or build from `aurelink-public`.

## Render static-site configuration
- Branch: `rebuild/aurelink-typescript-react`
- Root directory: repository root
- Build command: `pnpm install --no-frozen-lockfile && pnpm --filter @workspace/aurelink-react run typecheck && pnpm --filter @workspace/aurelink-react run build`
- Publish directory: `artifacts/aurelink-react/dist`
- Optional environment variable: `VITE_AURELINK_API_BASE=https://redom-backend.onrender.com/redom-backend`
- SPA fallback: rewrite `/*` to `/index.html`

No legacy frontend directory is needed by this build.
