# Stubbed web app

Next.js (App Router) app serving the public landing page (`/`), the owner-only app (`/app`), and public share pages and card images. See [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md).

```bash
cp .env.example .env.local   # fill in Supabase URL + publishable key
pnpm dev                     # from the repo root, or here
```

| Path | What |
|---|---|
| `src/app/` | Routes. `/` landing, `/app/*` owner app, `/login`, `/api/card/*`, `/e/[id]`, `/t/[id]` |
| `src/lib/supabase/` | Supabase clients: `client.ts` (browser), `server.ts` (server), `proxy.ts` (session refresh) |
| `src/proxy.ts` | Next.js 16 proxy (formerly middleware); refreshes the session on signed-in routes only |

## Public copy editor

Sanity Studio lives at `/dressingroom`. Copy is editable; screenshots, logos, icons, routes and downloads stay in the repository. See [CMS setup and editing](../../docs/CMS.md) for project configuration, seeding and previews. With no Sanity configuration, the site uses repository defaults.
