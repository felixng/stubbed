# Stubbed

Your theatre diary: log every show, rate it, group it into trips, and share it. Project brief: [Stubbed: Project Brief](https://docs.google.com/document/d/1NdEgeTRMkKQ5TL87Urwpe7WG9fcrejPsZKsmrO2Enak/edit) (Google Doc). Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Monorepo layout

```
apps/
  web/        Next.js: landing page, owner app, share cards (deployed to Vercel)
  ios/        SwiftUI app (planned)
supabase/     Shared backend: migrations, RLS, seed, DB tests
packages/     Shared JS packages, if any are ever needed
docs/         Brief, architecture, decisions
```

## Getting started

Requires Node 22+ and pnpm (`corepack enable`).

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # add Supabase URL + publishable key
pnpm dev                                       # http://localhost:3000
```

Other scripts (run from the root): `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Deploy

Vercel project with **Root Directory = `apps/web`**. Vercel detects the pnpm workspace and installs from the repo root.
