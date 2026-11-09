# Vercel + Neon deployment

The browser and Express API run in one Vercel project. Neon provides PostgreSQL, not the Express runtime. The browser calls same-origin `/api`; database credentials and signing keys must never use a `VITE_` prefix.

## Required configuration

| Variable | Scope | Purpose |
|---|---|---|
| `DATABASE_URL` | Server only, different database/branch per environment | Neon connection with TLS verification |
| `JWT_SECRET` | Server only, separate per environment | Random authentication secret, minimum 32 characters |
| `LICENSE_PRIVATE_KEY` | Server only | Ed25519 private key for issuing licenses |
| `LICENSE_PUBLIC_KEY_B64` | Server only | Matching SPKI DER public key, base64 encoded |
| `VITE_API_URL` | Public build | `/api` |
| `CORS_ORIGINS` | Server only, optional | Explicit additional trusted origins; current Vercel host accepted automatically |
| `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | Initialization only | One-time administrator setup; password is never reset on restart |

The ignored `.env.deployment.local` contains generated production setup values. Treat it as a password file; do not commit or copy into client assets. The original workspace `.env` is not overwritten. Never publish generated credentials in reports/logs.

## Initialize and validate

Use Node 24 and install root/frontend dependencies from committed lockfiles. Initialize each selected database explicitly before deployment:

```bash
node --env-file=.env.deployment.local --import tsx scripts/initialize-database.ts
npm run typecheck
npm test
npm run build:backend
cd frontend
npm run build
```

Vercel cold starts do not run migrations or administrator bootstrap. This prevents repeated schema writes and password setup on requests. Existing databases need migration validation; do not point initialization at an unrelated database.

## Release safety

- Test destructive/write workflows only on an isolated test branch with synthetic records.
- Use Vercel preview protection until the outstanding access-control/financial/backup requirements in the PRD pass release testing.
- A successful page crawl is not proof of every CRUD workflow, tenant isolation, payment collection, real email/SMS delivery, restore, or offline desktop operation.
- Current freshness is polling/request-based (React Query defaults to 60 seconds and account refresh to 30 seconds), not WebSocket push. Record visibility across sessions must be tested explicitly.
- Keep production and test data separate; generated artifacts must be traceable to the Git commit.
- Existing historical commits may contain legacy default credentials/development material. Generated deployment credentials are new and must not reuse those values.
