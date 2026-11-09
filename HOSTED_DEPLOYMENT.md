# Vercel + Neon deployment

Company: **AfriMind Tech & AI Consulting Agency (AfriMind)**. Product identifiers remain `sms` / `SVL-SMS`. Existing legacy hostnames, repository owner IDs and contact email addresses are retained until replacement domain/contact details are supplied; no customer school's stored name is automatically rewritten.

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

For development against the new Neon development branch, run `npm run dev:cloud` from the root. This explicitly uses `.env.development.local` and overrides the frontend's old local API setting, without replacing pre-existing workspace environment files. The browser runs at `http://localhost:5173` and calls the local API on port 3001.

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
- Current freshness is polling/request-based (React Query defaults to 15 seconds and account refresh to 30 seconds), not WebSocket push. Record visibility across sessions must be tested explicitly.
- Keep production and test data separate; generated artifacts must be traceable to the Git commit.
- Existing historical commits may contain legacy default credentials/development material. Generated deployment credentials are new and must not reuse those values.

## Provisioned resources (November 9, 2026)

- Git: `https://github.com/itconsultantbryant-svg/sms`, branch `main`; prior repository remains as local `legacy-origin`.
- Neon project: `aged-cloud-64581443` (`sms`), database `sms`, AWS Frankfurt, PostgreSQL 17.
- Neon branches: main/production; `preview` (`br-orange-unit-b954adz1`); `development` (`br-orange-hill-b906y9ca`). Production data was not copied from the previous project.
- Vercel project: `sms` (`prj_zOvUGov3Ym6uUJ7ELjdfnNAtBHmv`), scope `itconsultantbryant-svgs-projects`.
- Production alias: `https://sms-alpha-one.vercel.app`; all deployments require Vercel authentication while release blockers remain. The first deployment was automatically assigned production by Vercel; protection was subsequently enabled for all deployment types and verified.
- Five variables per environment are configured: database URL, JWT secret, issuer private key, verifier public key, and public `/api` URL. Bootstrap credentials stay in local ignored setup files, not client bundles.
- A test automation bypass is stored only in ignored `.env.e2e.local`; do not share it as a public URL. Revoke it from Vercel project protection settings when testing is complete.

## Repeat the live tests

The runner creates synthetic schools, logins, students, invoices, and grades. Only use the isolated preview database:

```bash
E2E_BASE_URL=https://YOUR-PREVIEW.vercel.app node --env-file=.env.preview.local --env-file=.env.e2e.local scripts/e2e-system.mjs
```

`E2E_ALLOW_WRITES=true` must be set in `.env.e2e.local`. The runner stores credentials under ignored `test-results/fixtures.local.json` with restrictive permissions and writes credential-free results to `test-results/system.json`. `E2E_API_ONLY=true` skips browser coverage; report that limitation. On supported hosts install the current Playwright Chromium. On this macOS 12 workstation, Playwright 1.48.2 with its Chromium 130 was used through `E2E_PLAYWRIGHT_MODULE` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`; this is a test-only compatibility workaround, not a production browser recommendation.
