# sms — SVL School Management System

School management software by **AfriMind Tech & AI Consulting Agency (AfriMind)**.

Repository: https://github.com/itconsultantbryant-svg/sms

## Hosted architecture

```text
Browser → Vercel React frontend → same-origin /api Express functions → Neon PostgreSQL
```

Neon hosts the database; Vercel runs both the frontend and the backend API. Separate Neon branches and Vercel variables isolate production, preview, and development. The Electron edition uses a local API and SQLite; cloud/desktop synchronization is not implemented.

- Node.js 24, TypeScript, Express, PostgreSQL/SQLite, bcrypt and JWT.
- React 18, Vite, Tailwind CSS, React Router and TanStack Query.
- Multi-institution administration, role dashboards, admissions/student records, attendance, teaching, gradebooks/results, fees, payroll, school operations and reporting.
- Live UI freshness is polling-based (normally 15 seconds), not WebSocket push.
- Hosted offline mode supports downloaded academic pages and queued attendance, score-entry and teacher-assignment saves, with deduplicated replay and conflict review. See [offline scope and remaining PRD work](OFFLINE_AND_PRD_IMPLEMENTATION.md); high-risk actions remain online-only.

## Documentation and release status

- [Product requirements](PRODUCT_REQUIREMENTS_DOCUMENT.md): reviewed baseline, target workflows and acceptance criteria.
- [Deployment guide](HOSTED_DEPLOYMENT.md): provisioned resources, environment configuration, initialization and test commands.
- [Live validation report](LIVE_VALIDATION_REPORT.md): evidence, failures, fixes, coverage limits and remaining release blockers.

Hosted alias: **https://sms-alpha-one.vercel.app**. Vercel authentication remains enabled for all deployments while security, recovery and other release gates are outstanding. A successful build/page crawl does not certify all business workflows or production readiness.

## Development

```bash
npm ci
npm --prefix frontend ci --legacy-peer-deps
```

With the generated, ignored `.env.development.local` file available:

```bash
npm run dev:cloud
```

This starts the local API on port 3001 against the new Neon development branch and the frontend on port 5173. It does not overwrite existing workspace `.env` files. For separate/custom local setups, `npm run dev` and `npm --prefix frontend run dev` remain available; configure their environment deliberately.

## Validation

```bash
npm run typecheck
npm test
npm run build:backend
npm --prefix frontend run build
```

The opt-in live runner, `scripts/e2e-system.mjs`, creates synthetic records and must only target an isolated test deployment. See the deployment guide for required flags and browser setup.

## Database setup and secrets

Run `scripts/initialize-database.ts` explicitly with the intended environment before a hosted deployment. Vercel requests do not run migrations or bootstrap accounts. First-time setup requires a strong `BOOTSTRAP_ADMIN_PASSWORD`; existing passwords are never reset on startup.

`DATABASE_URL`, `JWT_SECRET`, and license private keys are server-only. Never prefix secrets with `VITE_`, commit local environment files, publish test fixture credentials, or reuse historical default credentials. The browser uses the public `/api` URL only.

## Source layout

| Path | Purpose |
|---|---|
| `src/` | Active Express API, middleware, schemas and database adapter |
| `frontend/src/` | Active React application |
| `api/index.ts`, `vercel.json` | Hosted function entry and routing |
| `electron/` | Local desktop runtime and bridge |
| `scripts/`, `tests/` | Initialization, packaging and validation |
| `PRODUCT_REQUIREMENTS_DOCUMENT.md` | Product baseline and release requirements |

Historical backups/build output are not authoritative source. Legacy domain/contact identifiers remain unchanged until replacement ownership details are supplied; school-specific branding is not overwritten by the AfriMind company rename.
