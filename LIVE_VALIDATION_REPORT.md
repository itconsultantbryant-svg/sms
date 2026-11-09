# Hosted deployment and live validation report

Date: November 9, 2026. Product: `sms` / SVL-SMS. Company: **AfriMind Tech & AI Consulting Agency (AfriMind)**.

## Deployment outcome

- Existing Git history preserved and pushed to `https://github.com/itconsultantbryant-svg/sms`, branch `main`. Old remote retained locally as `legacy-origin`.
- New, isolated Neon project `sms` (`aged-cloud-64581443`), database `sms`, PostgreSQL 17, AWS Frankfurt, provisioned using the Neon CLI.
- Separate main/production, preview, and development branches initialized successfully. Original workspace/deployed school databases were not migrated or overwritten.
- New Vercel project `sms`; frontend and Express API share one origin, and only the API connects to Neon.
- Fifteen application environment entries configured: five each for production, preview, and development. URLs/secrets are server-only except the public `/api` setting. JWT secrets differ across environments; production signing keys are newly generated.
- One-time bootstrap credentials are retained in ignored, owner-readable local environment files. No generated credential appears in this report or committed test results.
- GitHub integration connected; production branch is `main`. Node version aligned to `24.x`.
- Production alias: **https://sms-alpha-one.vercel.app**. All deployment types require Vercel authentication. Requests without deployment authentication were observed redirecting rather than reaching the application.
- Production health returned HTTP 200, `status: ok`, `database: neon`; production had zero schools while synthetic test schools existed only in the preview branch.

**Release disposition:** Protected validation deployment, not an approved unrestricted real-school launch. See remaining limitations below.

## Code and configuration improvements delivered

1. Fixed backend TypeScript errors and installed the missing frontend PDF dependencies; committed dependency lockfiles for reproducible installation.
2. Replaced hardcoded/reset-on-start platform administrator passwords with explicit one-time bootstrap. No existing administrator password is overwritten on restart.
3. Centralized environment loading and required a strong production JWT secret; removed token-prefix logging from the reviewed authentication/client paths.
4. Restricted CORS origins, enabled PostgreSQL certificate verification, made health return an unavailable status when its database check fails, and stopped silently accepting failed schema initialization.
5. Removed bundled private-key fallback from license issuance; added configurable matching public-key verification and cryptographic regression tests.
6. Moved hosted database migration/bootstrap out of Vercel cold starts into explicit initialization; supplementary schemas also initialize for existing base databases.
7. Restricted arbitrary custom SQL reports to platform administrators.
8. Fixed student-create/edit permission enforcement, payroll read authorization, self-confirmed portal payments, and invoice/payment currency mismatch rejection. Student/parent portals now honestly direct users to the finance office; no gateway integration is implied.
9. Corrected PostgreSQL GROUP BY errors in due-fee and attendance reports; due balances are separated by currency in that report.
10. Deduplicated overlapping sidebar groups, increased normal query refresh frequency to 15 seconds, and added a repeatable live API/browser validation runner.
11. Replaced the legacy Render deployment workflow with Node 24 type checks, executable tests and builds. Existing desktop release workflows were not certified by this hosted validation.
12. Applied non-breaking dependency updates. Major-version upgrades and unresolved advisories are not silently forced.

## Validation method and results

### Local and build validation

- Backend/frontend TypeScript: passed after fixes.
- Automated unit/regression tests include teacher assignment combinations/session deduplication, signed-key verification/tamper rejection/no fallback, student mutation authorization, payroll read authorization, portal payment authorization, one-time/no-reset administrator bootstrap, and consistent AfriMind branding. See final counts below.
- Frontend and API builds: completed locally and in Vercel.
- Live database initialization: completed for all three new Neon environments.
- Browser runner: macOS 12 required a test-only compatible Playwright 1.48.2 / Chromium 130 installation. The application's target browser support is not certified by this workaround.

### First full live pass

**327 passed, 7 failed.** This included API read smoke tests, selected multi-session business workflows, real UI logins, role home/dashboard rendering, expanded sidebar navigation and registered-page visits.

Failures were investigated rather than treated as acceptable:

- Two real authorization failures: students could create student records and retrieve payroll salary data. Backend guards and regression tests were added.
- Two real PostgreSQL failures: due-fee and attendance-report grouping. Queries were corrected.
- Three test-input/actor issues: a teacher-only submissions endpoint was called as an administrator, and attendance/academic report calls omitted required class/exam filters. The runner now uses the correct actor and valid fixture IDs.

### Follow-up live passes

- Second pass: **214 passed, 4 failed**, interrupted by `ERR_INTERNET_DISCONNECTED`. The repaired permission probes and PostgreSQL report queries passed before the outage. Later browser-role coverage was incomplete.
- Expanded pass: **111 passed, 15 failed**, also interrupted by lost connectivity. The six added library, inventory, reception, certificate, lesson-plan and assignment workflows passed. Later fetch/browser failures were recorded, not counted as successful tests.

See the final result summary appended below and credential-free JSON produced by the runner. Fixture credentials are in a separate ignored `fixtures.local.json` and must not be published. An outage-interrupted pass is not a full-system success.

## Coverage interpretation

Role fixtures cover platform administrator, institution administrator, teacher, student, parent, accountant, registrar, staff, principal, HR manager, librarian, receptionist, transport manager, and branch administrator. Several specialized roles are synthetic custom-role fixtures with minimal permissions; this is not approval of a final school-specific access matrix.

The runner exercises selected real writes and verifies subsequent reads from separate sessions. Page checks require populated main content, no unexpected login redirect, no uncaught page exception, and no failed API response observed during navigation. A rendered form/list is **not** proof that every button, validation rule, upload, export, print operation, approval, or deletion works.

The route scan covers static GET endpoints with appropriate fixture filters plus selected dynamic workflows. It intentionally does not invoke every dynamic route or destructive action. Platform and institution administrator page visits cover the general registered screens; other users are tested against their discovered visible sidebar links. Dynamic pages require meaningful fixture records and are not all proven by static route coverage.

## Important remaining limitations / release gates

- **Not exhaustive E2E certification:** Every CRUD action, edge case, multi-role combination, branch boundary, cross-school object mutation, and asynchronous failure path still needs acceptance coverage.
- **Other tenant/action risks remain:** The PRD's route-by-route security audit is not complete. Some operational mutations and report reads have insufficient ownership/role enforcement. Do not expose the system for real-school data merely because the tested probes pass.
- **Backups:** The existing backup endpoint still records metadata without creating a recoverable artifact. No restore drill was performed. This remains a release blocker.
- **Messaging:** Actual SMS/email providers are not connected. Existing send handlers can still record misleading sent statuses; no real delivery is certified.
- **Licensing:** Automatic cloud entitlements, demo enforcement, device binding, revocation and recovery still need a unified policy and end-to-end validation.
- **Admissions:** The active application-to-enrolled-student final workflow remains incomplete. Direct student registration is tested; marking an application admitted is not proof of conversion.
- **Finance:** Staff-recorded collections and same-currency validation are tested, not bank/mobile-money/card settlement. Aggregate currency treatment, concurrency/idempotency, reversals, reconciliation, retention and payroll rules require further work.
- **Operations:** Transport assignment creation/ownership and several other operations still require explicit write-path validation; schema/code inspection is not a passing result. Library/stock concurrency and policy edge cases are not certified.
- **Academic lifecycle:** Gradebook approval/publication is tested, but all exam pipelines, promotion/rollover, incomplete grades, document history and correction controls are not certified.
- **Dependencies:** After safe updates, the root production audit still reports four advisories (three moderate, one high), including `xlsx` with no npm fix. Frontend audit reports seven advisories (three moderate, four high), including desktop/build dependencies and router/XLSX items. No unsafe forced major upgrade was applied.
- **Performance:** Large frontend bundle warning remains. No concurrency/load SLA, large-school scale, cold-start budget or full accessibility/mobile-browser matrix was validated.
- **Desktop:** Installer signing, clean-machine installation, offline upgrade, local binding and restore were outside this hosted test run.
- **Freshness:** Updates are request/polling-based, not WebSocket push. Normal React Query polling is 15 seconds; role refresh is 30 seconds. API read-after-write is not by itself evidence of automatic browser refresh.
- **Security perimeter:** Vercel authentication is an additional temporary perimeter, not a replacement for application role and tenant authorization. Keep it enabled until release gates are satisfied.

## How to reproduce

See `HOSTED_DEPLOYMENT.md` and `scripts/e2e-system.mjs`. Use only an isolated synthetic-data preview branch with explicit `E2E_ALLOW_WRITES=true`. Generated JSON includes per-check names, outcomes and durations; it excludes tokens/passwords. Do not commit `.env.*.local`, test fixtures, automation bypass secrets, database URLs, or license private keys.
