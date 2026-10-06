# Rohith Reddy — Portfolio (100% Cloudflare)

One Cloudflare Worker serves the static site **and** the API; data lives in **D1**.

```
├── frontend/              static site (index.html, config.js, _headers, resume PDF fallback)
├── worker/src/index.js    the API (Hono) — /api/*
├── database/
│   ├── migrations/        0001_init.sql (schema), 0002_seed.sql (your content + resume, generated)
│   ├── build-seed.js      regenerates 0002_seed.sql  (npm run db:seed:build)
│   └── assets/            resume PDF used by the seed
├── wrangler.toml          Worker + assets + D1 binding
└── package.json
```

Browser → `rohith-portfolio.<you>.workers.dev` → static files, or `/api/*` → Worker → D1.

## Run locally
```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev            # applies migrations to a local D1, then http://localhost:8787
```
See **DEPLOY.md** to go live.
