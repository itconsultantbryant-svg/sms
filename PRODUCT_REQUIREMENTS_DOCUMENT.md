# SVL-SMS — Product Requirements Document

**Product:** SVL School Management System, AfriMind Tech & AI Consulting Agency (AfriMind)

**Document version:** 1.0 — codebase-derived baseline and proposed release requirements

**Review date:** November 9, 2026

**Audience:** Product owner, school leadership, engineering, QA, implementation, and support
**Status:** Draft for stakeholder approval; not a certification of production readiness

> This is the initial code-review baseline. Subsequent deployment hardening, live test results, and remaining release limitations are tracked in `HOSTED_DEPLOYMENT.md` and `LIVE_VALIDATION_REPORT.md`; baseline findings below must not be interpreted as all still unchanged or all resolved.

> Later teacher-assignment hardening and the scoped browser offline/synchronization implementation are tracked in `OFFLINE_AND_PRD_IMPLEMENTATION.md`. Offline financial settlement and full standalone desktop/cloud replication are not implied.

## 1. Executive summary

SVL-SMS is a substantially developed school-management platform with a React web application, an Express API, multi-institution administration, role-specific portals, and an Electron desktop edition. It brings student registration, academic setup, teaching, attendance, assessments, fees, payroll, school operations, communications, and reports into one system.

The product is oriented toward Liberian schools: Liberia-specific profile fields, USD/LRD currency selection, school-specific branding, and printed academic and financial documents are present. The schema also anticipates broader institution types, subscriptions, and resellers, but schema presence alone does not establish usable products for those segments.

**Assessment:** Broad feature implementation exists, but the current workspace should not be called production-ready. Critical access-control, credential-bootstrap, financial-verification, backup, licensing, build, and workflow-completeness issues remain. Existing “complete” percentages and historical test claims are not reliable release evidence.

**Recommended next release:** A secure, recoverable school-operations release that proves the complete enrollment → teaching → approved results → invoicing → verified collection workflow. Stabilize existing scope before adding more modules.

## 2. Evidence, scope, and interpretation

### 2.1 Review method

Reviewed the active entry points, route registration, frontend navigation/screens, authentication and tenant middleware, database initialization and schemas, licensing, finance, admissions, academic workflows, desktop startup/build scripts, deployment configuration, CI definitions, tests, and workspace layout. Existing Markdown documents were treated as historical context, not proof of completion.

Status terminology used throughout:

| Status | Meaning |
|---|---|
| Implemented | Active source contains a meaningful implementation; not necessarily runtime/UAT verified. |
| Partial | Some pieces exist, but an end-to-end workflow, enforcement, integration, or operational guarantee is missing. |
| Schema only / unverified | Tables/configuration exist without sufficient evidence of a complete active workflow. |
| Required | Proposed target behavior; must not be represented as delivered. |

No application server was started against the workspace databases, no dependencies were installed, and no live deployment or provider was contacted. Environment secret values, license-key records, and personal records were not copied into this document. Database inspection was limited to read-only schema metadata attempts.

### 2.2 Verification performed

| Check | Result |
|---|---|
| Initial Git working tree | Clean. |
| Backend type check: `./node_modules/.bin/tsc --noEmit --project tsconfig.json` | Failed: health-check variable typing in `src/index.ts`; Buffer/crypto type incompatibilities in `src/utils/license-issuer.ts` and `src/utils/licensing.ts`. |
| Frontend type check: `./node_modules/.bin/tsc --noEmit --project frontend/tsconfig.json` | Failed: `jspdf` and `jspdf-autotable` could not be resolved in the installed workspace. Both are declared dependencies; this does not prove a clean installation would fail identically. |
| Targeted test: `./node_modules/.bin/tsx --test tests/teacher-assignments.test.ts` | Passed: 2 tests covering assignment combinations, duplicate avoidance, session/section handling, and a PostgreSQL translation assertion. Uses an isolated in-memory database. |
| Local database metadata | Read-only opening of `data/svl-sms.db` failed in this environment; no diagnosis of corruption is implied. `data/svl_sms.db` opened but contained no user tables. |
| UI, live APIs, deployed database, installers, restore, load/security tests | Not exercised. Existing artifacts and configuration are not substitutes for these tests. |

The frontend build script runs Vite rather than a separate TypeScript check. A frontend bundle build alone must not be treated as full type validation.

## 3. Product purpose and objectives

### 3.1 Problem statement

Schools need a reliable shared record of enrollment, guardians, teaching assignments, attendance, academic performance, and money owed/collected. Fragmented spreadsheets and paper records create duplicate entry, delayed reporting, unverified payments, inconsistent grades, and weak accountability. Platform operators additionally need to provision and support multiple schools without exposing one school's information to another.

### 3.2 Target users and jobs

| Persona | Main job | Required boundary |
|---|---|---|
| Platform administrator | Provision institutions, manage platform users, subscriptions/licenses, activations, and support. | Platform actions explicit and audited; school context clearly selected. |
| Institution administrator | Configure and run one institution, manage staff access, approve academic work. | Own institution only. |
| Branch administrator / principal | Oversee a campus, teaching, attendance, results, and approvals. | Authorized institution and branch; current branch enforcement requires verification. |
| Registrar / admissions officer | Track applicants, enroll students, maintain historical records and guardian links. | Authorized student records, not unrestricted finance or platform controls. |
| Teacher | Work with assigned classes/subjects, mark attendance, issue assignments, enter and submit grades, read lesson plans. | Own teaching assignments and permitted student fields. |
| Accountant / finance officer | Set fees, issue invoices, verify collections, reconcile accounts, prepare reports. | Own school's financial data and approved financial actions. |
| HR manager | Maintain employee, salary, leave, loan, and payroll records. | Authorized staff/payroll data. |
| Librarian / operational staff | Manage books, stock, transport, reception, or communications as assigned. | Only the granted modules/actions. |
| Student | View own attendance, assignments, approved grades, and fee statement; submit work. | Own record only; cannot confirm receipt of money. |
| Parent / guardian | Follow linked children's attendance, learning, notices, and balances. | Explicitly linked children with access rights. |

Role names appear in code, but not every role has a fully consistent API policy or dedicated dashboard. The approved access matrix must govern implementation, not menu visibility.

### 3.3 Proposed measurable outcomes

These are release targets for approval, not observed measurements:

- 100% of tenant-isolation and critical permission tests pass; zero cross-school disclosures in the release test suite.
- A trained registrar completes a standard direct enrollment with guardian and fees in five minutes or less, excluding document collection.
- Every approved payment has an authorized verifier/provider reference and reconciles to its invoice and currency.
- Every student-visible grade comes from the school's approved publication process.
- At least 95% of pilot-school core daily tasks complete without support intervention during a two-week pilot.
- Real backup restoration meets the recovery objectives in Section 10.
- No unresolved P0 release blocker; all known P1 defects have an approved disposition.

## 4. Product scope and release boundaries

### 4.1 In scope for the stabilized product

1. Multi-school and multi-branch administration, branding, users, roles, and access.
2. Enquiry/application tracking, direct enrollment, student/guardian records, transfers/prior records.
3. Academic sessions, terms, classes, sections, subjects, teaching assignments, timetable.
4. Attendance, homework/submissions, lesson-plan distribution.
5. Assessments, gradebooks, approval/publication, report cards, promotion.
6. Fees, invoices, verified payments, receipts, balances, income/expenses, financial reporting.
7. Employee administration, salary structures, payroll, leave, and loans.
8. Library, inventory, transport, reception, certificates, and ID-card workflows.
9. Announcements, in-app notifications, acknowledgements, and honest outbound-message status.
10. Web deployment and a separately validated local desktop deployment, licensing, exports, backups, and support tooling.

### 4.2 Deferred or not demonstrated

- Bidirectional desktop/cloud record synchronization and conflict resolution.
- Native Android/iOS apps; the current mobile experience is the web interface.
- Complete university registrar/LMS workflows, credits, degree audits, and course registration.
- Full double-entry accounting, statutory tax certification, bank reconciliation, or payroll disbursement.
- Live vehicle tracking, biometric attendance, AI timetable generation, and external learning-platform integrations.
- A complete reseller/franchise portal or automated subscription checkout simply because related tables exist.
- Automatic installation of desktop updates: the current updater opens a release-download page.

External messaging and payment providers require separate commercial/technical decisions. If not included in the release, the UI must explicitly describe manual recording or unavailable delivery rather than imply a completed integration.

## 5. Workspace and implementation inventory

### 5.1 Authoritative source and supporting material

| Location | Role and assessment |
|---|---|
| `src/index.ts`, `src/routes/` | Active Express application and mounted business APIs. 38 API router mount calls were found, excluding the standalone health route. |
| `frontend/src/` | Active React application; `App.tsx` contains 77 route declarations, including wrappers and redirects. |
| `src/database/init.ts` | Selects SQLite or Neon, initializes schemas, applies enhancement/backfill routines. |
| `src/database/schema-v2-consolidated.ts` | Base schema contains 103 `CREATE TABLE IF NOT EXISTS` declarations; supplementary schemas add more entities. This is not a claim that all are deployed or operational. |
| `electron/main.ts`, `electron/preload.ts` | Desktop lifecycle, local backend, IPC bridge, logging, update notification. |
| `api/index.ts`, root `vercel.json` | Same-origin Vercel API adapter and frontend deployment configuration. |
| `render.yaml`, Docker files | Alternative service-hosting/container paths; configuration needs consolidation. |
| `scripts/`, `tools/` | Desktop packaging, connectivity/key utilities, license issuance/verification tooling. |
| `tests/` | One TypeScript test file with two tests found. Root package has no standard `test` script. |
| `test-licensing.sh`, `API_TEST_SCENARIOS.md` | Additional manual/scripted test material; not executed during this review. Historical pass claims are not current verification. |
| `data/` | Multiple database filenames and an older backup file; runtime authority depends on `DB_PATH`/`DATABASE_URL`. |
| `backend-backup/` | Historical source/build tree. In its `src` tree, 15 matching TypeScript files were identical to active source and 32 differed. Do not use it as the current backend without reconciliation. |
| `backend/` | No source files found under `backend/src`; data, dependencies, and compiled artifacts remain. |
| `dist/`, `frontend/dist/`, `out/` | Generated build artifacts. Windows installer/ZIP and macOS DMG/ZIP files exist in `out/`; freshness, signatures, and installability were not verified. `out/` is approximately 1 GiB excluding dependency-tree files. |
| `shared/`, `src/config/`, `src/controllers/`, `src/models/` | Directory presence does not establish active functionality; the main implementation is route-centric. |
| Root Markdown reports | Historical summaries often conflict with each other and with current source. |

Backups, `.backup`/`.bak` frontend files, duplicate builder configurations, generated distributions, local databases, environment files, and generated license records should be classified and excluded from distributable source where appropriate. Do not delete them without ownership/retention review.

### 5.2 Technology baseline

- **Frontend:** React 18, TypeScript, Vite 5, Tailwind, React Router, TanStack Query, Axios, Recharts, XLSX, jsPDF tooling.
- **Backend:** Node.js, Express, TypeScript, bcrypt password hashing, JWT bearer authentication, UUID-style identifiers.
- **Persistence:** `better-sqlite3` for local/file-backed operation; `pg` plus a custom synchronous SQLite-shaped adapter for Neon PostgreSQL.
- **Desktop:** Electron 30 and electron-builder; Windows NSIS x64, macOS DMG/ZIP, Linux AppImage configured.
- **Runtime contract:** Package manifests and Render config specify Node 24. Some scripts, README text, and CI still refer to Node 18/20; standardize rather than infer compatibility from old comments.
- **Licensing:** Current offline verifier uses Ed25519 signatures, not the RSA mechanism described in older documents.

## 6. How the product currently works

### 6.1 Web architecture

```text
School or platform browser
  → React application and role-specific navigation
  → Axios /api requests with bearer token
      + selected X-Institution-ID for platform school context
  → Express authentication → tenant context → route-level checks
  → business SQL and database adapter
  → SQLite OR Neon PostgreSQL
```

The production browser client prefers same-origin `/api`. Root Vercel configuration serves the frontend and forwards API requests through `api/index.ts`. A separate Render backend is also configured, but the current hosted-client resolver does not simply honor a different build-time backend URL in normal production-web mode. The deployment topology must therefore be deliberately selected and tested.

When `DATABASE_URL` selects Neon, `src/database/neon-db.ts` translates SQLite-oriented SQL and sends PostgreSQL work through a worker thread. Callers wait synchronously using `Atomics.wait`. This preserves existing route code but blocks the main JavaScript thread while each query completes; it needs compatibility, serverless-lifecycle, throughput, timeout, and reconnection validation before scale claims are made.

### 6.2 Identity, school context, and navigation

1. User logs in with username or email and password.
2. Backend checks active user and bcrypt hash and returns a 24-hour JWT and mapped user details.
3. Frontend stores session information in local storage and selects a role-specific home and menu.
4. Protected API requests reload the active user, merge roles/permissions, and evaluate school licensing; platform admins bypass school licensing.
5. Tenant middleware scopes normal users to their institution. Platform admins can supply a school header; without one, middleware may choose the first active institution.
6. Schools have branding settings and a school-code/subdomain helper. DNS, TLS, custom-host ownership, and login/tenant consistency still require deployment verification.

The frontend route wrapper checks whether a user is logged in, not a permission for every route. Menu hiding and local-storage flags are presentation behavior, not a security boundary. Backend authorization must be complete even when a caller bypasses the UI.

### 6.3 School onboarding and licensing

Platform administration includes institution creation, school administrator setup, subscription fields, branding, users, license issuance/revocation, and activation visibility. Desktop startup can seed a default offline institution/admin on the fresh-platform-admin creation path.

The UI offers demo/production setup, a watermark, feature flags, and expiry display. The active verifier accepts signed offline keys containing version, expiry, and tier; institution/device identity is not included in that signed payload. Activation records and machine IDs provide additional metadata, but stronger binding semantics need an explicit design.

Current authentication can automatically issue a one-year production license when a school has no active license. That availability-oriented behavior conflicts with strict commercial entitlement enforcement and can interact incorrectly with revocation. Demo restriction middleware exists but is not globally wired into the protected route pipeline; student creation has no demonstrated authoritative 50-student gate. The demo endpoints mounted in `src/index.ts` expect `req.user` but are not supplied authentication there or within that router.

The frontend's periodic license check-in uses the normal API client. In desktop mode that resolves to the local backend; this alone does not demonstrate remote activation reconciliation with the platform service.

### 6.4 Enrollment and student lifecycle

Direct student registration is the strongest implemented enrollment path:

```text
Student form → student record + login account
             → optional guardian record + guardian login + relationship links
             → optional prior records/files
             → best-effort class-fee assignment/invoice creation
             → generated temporary credentials returned to operator
```

Student creation uses a database transaction for the core records; class-fee assignment runs afterward and can fail without undoing enrollment. The UI/operator must distinguish “enrolled” from “successfully billed.”

The separate admissions module supports enquiries, enquiry-to-application conversion, application lists/creation, and status changes. However, the active `admission.ts` ends after status updates and does not mount the final application-to-student `/admit` workflow found in `admission-old.ts`. Changing an application to `admitted` is not proof of student/account/fee creation. `/admission/applications/new` also renders the enquiry form component and needs end-to-end validation.

### 6.5 Teaching, grades, and promotion

- Administrators configure sessions, terms, classes, sections, subjects, and class-subject/teacher assignments.
- Teachers get assigned-class/student views, attendance, homework/submission grading, assigned lesson plans, and gradebooks.
- Administrators distribute lesson plans, optionally with files; teachers can mark receipt as seen.
- Gradebooks support weighted activity columns, scores, computed totals, submission, approval, rejection, and imports.
- Gradebook workflow: `open/draft → submitted → approved`, or `submitted → rejected → editable/resubmitted`.
- Approved gradebook data feeds term/year gradesheets, with school branding and signature settings.
- Existing grade helpers use A ≥90, B ≥80, C ≥70, D ≥60, otherwise F; yearly promotion eligibility is an average ≥70. These are current hardcoded rules, not confirmed policy for every school.
- A promotion helper chooses the next active class by configured order and archives gradesheet information. Session rollover, repeated execution, terminal-class graduation, incomplete grades, and reversals need explicit controls.
- Parallel exam marks/results/publication and grade-submission approval APIs also exist. A single authoritative academic policy must reconcile them with gradebooks.

### 6.6 Finance

Fee types and class/session/term structures feed invoices; class-fee assignment attempts to avoid duplicate billing. Payments update paid amount, balance, and invoice status within a transaction and can produce receipts. Income/expense categories, entries, ledger/report views, and payroll are implemented.

USD/LRD currency fields and UI selection are present. This is not proof of correct currency conversion or reporting: payment recording accepts a currency choice without demonstrated conversion into the invoice's currency, and several summaries aggregate numeric values without currency separation.

**Critical current behavior:** Student/parent fee portals can submit a payment record which the API immediately marks `completed` and deducts from the invoice balance. No gateway confirmation or independent staff verification is involved. This is recording a claim of payment, not collecting or verifying money, and must be redesigned before real financial use.

### 6.7 Operational modules, communications, and documents

- Library: categories/books, issue, return, availability, and issue history.
- Inventory: categories/items, stock transactions, quantities/minimum levels.
- Transport: vehicles/drivers, routes, stops, fares, student assignments.
- Reception: visitor check-in/out, phone-call logs, postal records.
- Certificates and ID cards: template and generation/data routes with school-document rendering support.
- Payroll: structures/components, employee salaries, monthly runs, payslips, leave, and loans; not bank disbursement or validated statutory payroll.
- Communication: announcements, templates, recipient selection, message history, and logs; notification read/acknowledgement support exists.
- SMS/email creation in the active `communication-simple.ts` writes `sent` status and counts directly. No actual delivery provider call exists in these handlers.
- Reports include student, attendance, academic, and financial outputs; shared frontend helpers support printable/PDF-style documents and spreadsheet workflows. Availability and formatting must be tested screen by screen.
- The backup endpoint currently inserts a completed backup record/path without creating a recoverable backup file.

### 6.8 Desktop execution

```text
Electron main process
  → choose available local API port
  → development: spawn tsx backend
  → packaged: import compiled Express backend in-process
  → database in Electron user-data directory
  → load bundled React UI using preload API URL bridge
```

The window disables Node integration and enables context isolation and sandboxing. The local API must additionally bind only to loopback; packaged code currently calls `listen(port)` without an explicit loopback host. HTTP links can open in the external browser. Daily/startup update checks query GitHub releases and offer a browser download, not unattended installation.

The desktop is a local deployment, not demonstrated synchronized cloud/offline storage. Concurrent use from other school devices, shared-school data access, and migration between web and desktop require separate approved deployment workflows.

## 7. Functional requirements and acceptance criteria

**Priority:** P0 = blocks real-data rollout; P1 = required for a supported school release; P2 = enhancement after stabilization. Requirements below describe target behavior, including hardening of existing features.

### FR-01 — Platform, tenancy, and school onboarding — P0

**Current:** Institution/branch CRUD, onboarding, platform dashboards, school settings, and tenant middleware implemented; enforcement incomplete.

**Requirements:** Explicit school selection for school mutations; validated school/branch ownership for every referenced entity; deny-by-default API policy; institution activation/subscription policy enforced consistently; platform access audited. Replace request-time adoption of null-tenant records with a reviewed migration.

**Acceptance:** With two schools and separate branches, every list/detail/create/update/delete/export/import and linked-ID operation rejects unauthorized cross-school access. An institution admin cannot read another school via custom reports. Platform mutations cannot silently target the first school. School deactivation takes effect according to documented policy.

### FR-02 — Authentication, roles, and credential lifecycle — P0

**Current:** Bcrypt, 24-hour JWT, merged roles, role/permission editors, user administration, password changes, and student password-change approvals implemented. Logout is a success response, not server-side token revocation.

**Requirements:** One-time secure administrator bootstrap; no fixed/reset-on-boot passwords; required production secrets; first-login credential rotation; login throttling; approved password policy; secure session storage/lifecycle and revocation. Enforce permissions at action and object level, including generic record endpoints. Confirm or revise the student password-approval policy with school leadership.

**Acceptance:** Restart never changes an existing password. Missing production secret prevents startup. Disabled users/roles lose access promptly. Unauthorized users cannot mark grades, create students, inspect salaries, reset accounts, or invoke hidden routes. Approved role changes are reflected without relying on client-controlled flags. Sensitive administrative access has an agreed MFA requirement.

### FR-03 — Admissions and enrollment — P1

**Current:** Enquiries/applications partial; direct enrollment, guardian accounts, prior records, and fee assignment implemented.

**Requirements:** Enquiry → application → review → approve/reject → enroll; a dedicated enrollment operation creates or links student, guardian, account, class, session, and fee records exactly once. Track review notes, document checklist, decision actor/time, and source application. Admission tests/interviews are optional scope, not delivered merely because tables exist.

**Acceptance:** Repeated enrollment requests cannot duplicate a student/account/invoice. Invalid/cross-school class or guardian IDs are rejected. Failed steps roll back or expose a recoverable reconciliation state. “Admitted” means an actual linked student exists. New Application renders and submits the correct form. Credential handover is restricted and temporary.

### FR-04 — Student, parent, and historical records — P1

**Current:** Profiles, accounts, guardian links, previous-school fields, files, and portal views implemented; more than one guardian-link representation exists.

**Requirements:** Stable admission identifiers; validated demographics/contact data; controlled guardian-child linking; transfer, inactive, graduated, and withdrawal states; immutable academic history across class/session moves. Reconcile `student_parents` and `parent_students` identity semantics. Restrict medical/profile/file visibility by role.

**Acceptance:** Parent can access only explicitly linked permitted children; unlinking removes access. Existing guardians can be reused without duplicate accounts. Historical report cards remain available after promotion. Uploaded files obey size/type rules and do not expose unsafe active content.

### FR-05 — Academic structure, staffing, and timetable — P1

**Current:** Sessions, terms, classes/sections, subjects, departments/designations, teaching assignments, class/teacher timetable APIs implemented.

**Requirements:** One authoritative current session per institution; valid dates and class capacity policy; class-subject mappings; teacher assignment combinations; branch/session-aware timetable with teacher/class/room conflict detection.

**Acceptance:** No duplicate assignment for the same school/class/section/subject/session. Reject overlapping teacher/class periods and cross-school references. Inactive employees cannot receive new assignments. A teacher sees only assigned rosters and the minimum student information needed.

### FR-06 — Attendance — P1

**Current:** Administrative and teacher attendance paths, session edits, summaries, and student/parent views implemented.

**Requirements:** Authorized roster-based marking; approved status vocabulary; duplicate-session prevention; correction permissions/audit; consistent daily and period-level policy; accurate date-range reports.

**Acceptance:** Teacher cannot mark another teacher's unassigned class. Re-saving updates rather than double-counts. Future dates and invalid roster IDs follow explicit validation rules. Student/parent totals match the source attendance sessions and show absence/late/excused rules consistently.

### FR-07 — Homework and lesson plans — P1

**Current:** Assignment CRUD, student submission and grading; administrator-authored lesson-plan distribution, attachments, import, and seen tracking.

**Requirements:** Class/subject/section and due-date targeting; submission lifecycle, late policy, safe attachments, teacher feedback; lesson-plan recipient permissions and receipt state. Teacher-authored lesson-plan approval is a separate scope decision.

**Acceptance:** Only intended students see/submit an assignment, and only an assigned authorized teacher grades it. Resubmissions and deadline handling are deterministic. Only assigned teachers see restricted plan files. Imported rows have actionable per-row validation errors.

### FR-08 — Assessments, gradebooks, approval, and publication — P0

**Current:** Multiple implemented academic pipelines: exams/marks/results, grade submissions/approval, and weighted gradebooks.

**Requirements:** Agree one authoritative calculation/publication model and map legacy pipelines to it. Enforce score bounds, total weights, roster/column membership, absent/missing-score policy, teacher assignment, approval permissions, published-version locking, and audited corrections. Configure school grade thresholds and rounding rather than assume one universal rule.

**Acceptance:** A 50/100 score at 40% weight contributes 20 percentage points. Invalid scores, unrelated columns/students, and unauthorized direct marks writes are rejected. Draft/submitted/rejected values are not visible as official student results. Approval/rejection is school-scoped. Report cards and portals agree on the same published version.

### FR-09 — Promotion and academic-year rollover — P1

**Current:** ≥70 yearly average eligibility, ordered-next-class helper, and prior-record archival implemented.

**Requirements:** Configurable policy; completion checks for required terms/subjects; preview and administrator approval; explicit next session/class/section mapping; terminal-class graduation; repeat-safe execution and controlled reversal.

**Acceptance:** Missing grades cannot accidentally qualify a student based on a partial average. Running promotion twice does not advance two classes. Former-year records remain immutable and accessible. Graduates and repeaters receive the approved lifecycle state without overwriting their academic history.

### FR-10 — Fees, invoices, collections, and currency — P0

**Current:** Fee structures/discount data, duplicate-aware class billing, invoices, partial payments, receipts, dues, portals, currency fields implemented; money verification and currency integrity unsafe.

**Requirements:** Clear fee schedule/session/term rules; database-enforced invoice-line uniqueness/idempotency; exact monetary precision; immutable receipt numbering; validated payment status transitions; staff-only confirmation or verified provider webhooks; reversals/refunds/credit policy; currency-specific balances and reports. Define whether FX is supported; otherwise require invoice/payment currency equality.

**Acceptance:** Student/parent submission creates `pending verification` or starts an actual provider flow; it cannot settle an invoice directly. Replayed requests/webhooks create one payment. Concurrent payments cannot overpay or lose updates. USD and LRD are not added as though equal. Every completed receipt reconciles to a verified transaction; reversals preserve the original record and audit trail.

### FR-11 — Accounts and financial reports — P1

**Current:** Income/expenses, categories, ledger, finance dashboards, and report endpoints implemented.

**Requirements:** Role-restricted financial access; currency/date/branch/session filters; fee-receipt inclusion and duplicate-income policy; period close and controlled corrections; explicit distinction between operational cash summaries and full accounting.

**Acceptance:** Dashboards, receipt totals, invoice balances, and exported reports reconcile for the same period/currency. Unknown query failures show an error/unavailable state instead of a plausible zero. A non-finance role cannot retrieve financial or payroll reports by direct URL/API call.

### FR-12 — Employees, payroll, leave, and loans — P1

**Current:** Employee/salary setup, fixed/percentage components, monthly processing, payslips, leave, and loan records implemented.

**Requirements:** HR/finance confidentiality; institution/branch scope on every read/write; effective-dated salaries; approved earnings/deduction formulas; currency propagation; processing approval, repeat protection, rollback/correction, and paid-vs-processed distinction. Confirm local tax, social contribution, and leave policies with qualified stakeholders.

**Acceptance:** A test payroll's line items reconcile to gross, deductions, and net in one currency. Duplicate processing does not double-deduct loans. One school's payroll ID cannot be processed/viewed by another. Ordinary school users cannot inspect all employee salaries. Payslip generation does not imply bank disbursement.

### FR-13 — Library and inventory — P1

**Current:** Book/item categories, books, availability, issues/returns, stock transactions and quantities implemented.

**Requirements:** School ownership checks, positive quantities, atomic issue/return/stock changes, overdue/fine policy, stock adjustment reasons, low-stock indication, and retained transaction history.

**Acceptance:** Simultaneous issue requests cannot make availability negative. Return is repeat-safe. A cross-school book/borrower/item ID is rejected. Deleting an item cannot silently erase required historical transactions; deactivation is preferred.

### FR-14 — Transport and reception — P1

**Current:** Vehicles/routes/stops/fares, student assignment, visitors, calls, and postal logs implemented.

**Requirements:** Route/stop/student ownership; capacity and assignment validation; controlled driver/visitor personal data; visitor checkout lifecycle; staff access controls and retention policy.

**Acceptance:** A student cannot be assigned a stop outside the selected route or school. Visitor checkout is recorded once with actor/time. Operational users see only authorized logs. No live GPS tracking or actual transport-fare collection is claimed unless separately integrated.

### FR-15 — Communication and notifications — P1

**Current:** Announcements, templates, recipient lists, in-app inbox/read/acknowledgement implemented; outbound SMS/email delivery is not implemented in the active handlers.

**Requirements:** Provider integration or explicit draft/manual-only mode; queue/retry/idempotency; per-recipient delivery statuses, consent/opt-out, school sender identity, failure/cost visibility; audience-scoped announcements and acknowledgements.

**Acceptance:** A message is never `sent` merely because a database insert succeeded. Provider sandbox tests prove delivery/failure handling. Wrong-school or unauthorized recipients cannot be targeted. Read and acknowledged remain distinct, with auditable user/time.

### FR-16 — Reports, exports, certificates, and documents — P1

**Current:** Report endpoints, grade/report-card views, templates, certificates, ID-card data, spreadsheet and print/PDF helpers implemented.

**Requirements:** Consistent school logo/header/signatures; correct student/session/term/currency; permission/licensing enforcement on both API and export UI; accessible previews; safe escaping; controlled certificate numbering/reissue. Replace arbitrary institution-admin SQL with tenant-bound report definitions.

**Acceptance:** A school document never uses another institution's logo or records. Unpublished grades and unauthorized PII cannot be exported. PDF/print works in both browser and Electron. Large exports have limits and clear failures. Archived documents retain the identity/version under which they were issued.

### FR-17 — Licenses, trials, subscriptions, and activation — P0

**Current:** Signed-key verification/issuance, activation/check-in data, platform screens, feature flags and demo UI exist; entitlement policy conflicts remain.

**Requirements:** One authoritative state machine for trial, active, expired, suspended, revoked, and grace access; documented tier/student/staff/device limits; server-enforced limits; authenticated school activation and recovery; issuer secret isolation; stable machine identity and approved offline validity/revocation constraints. No automatic production license creation as a fallback for missing/revoked entitlement.

**Acceptance:** Trial limits cannot be bypassed by API calls or local-storage edits. Expiry/revocation do not silently create replacement entitlement. Activation/renewal works when ordinary licensed APIs are blocked. Malformed/tampered keys fail. Offline guarantees accurately disclose that an isolated device cannot immediately learn of remote revocation. Local check-in is not presented as proven cloud synchronization.

### FR-18 — Backup, restore, audit, and data deletion — P0

**Current:** Backup metadata API, audit tables/log endpoints, and hard-delete/purge utilities exist; backup creation is not real and audit coverage is not proven comprehensive.

**Requirements:** Real consistent SQLite snapshots and PostgreSQL backup strategy; encrypted storage, checksum, retention, access controls, restore tooling/drills, school export/exit process; audit privileged/financial/academic actions. Replace routine destructive deletion with archival and policy-governed retention; restrict exceptional purge with confirmation and audit.

**Acceptance:** A fresh environment restores a selected backup and reconciles student counts, published grades, invoice balances, and guardian access. `completed` is set only after artifact creation/validation. An institution backup cannot expose other schools. Deleting a student/account/fee structure cannot silently destroy retained financial or academic evidence.

### FR-19 — Desktop installation, locality, and upgrades — P1

**Current:** In-process packaged backend, local database, bridge, logs, manual update notification, build targets, and Windows/macOS artifacts present.

**Requirements:** Loopback-only API; install/start without system Node; approved secure initial setup; platform/architecture test matrix; signing/notarization as applicable; backup-before-upgrade, schema migration and rollback; local-data retention on uninstall; accurate manual-update wording. Clear statement that desktop/cloud are separate stores unless a sync project is approved.

**Acceptance:** Fresh supported Windows/macOS installations work offline after valid activation and survive restart/upgrade without losing records. Port conflict handling and startup-error recovery work. No private signing key or environment secret is bundled. Local API is unreachable through non-loopback interfaces. App upgrade does not overwrite school data.

## 8. Cross-module data requirements

### 8.1 Principal relationships

```text
Institution → branches, branding/settings, users/roles, licenses/subscription
Institution → sessions → terms
Institution → classes → sections; classes ↔ subjects
Users ↔ roles/permissions; users ↔ employee/student/parent identities
Employees → teaching assignments → class + subject + section + session
Students ↔ guardians; students → attendance, submissions, invoices, prior records
Gradebooks → columns + entries + totals → approval → gradesheets
Exams → schedules → marks → results → publication/report cards
Fee structures → invoice items → invoices → verified payments/receipts
Employees → salary structures/components → payroll → payslips/items
Books → issues/returns; inventory items → stock transactions
Vehicles → routes → stops → student transport
Announcements/messages → recipients → read/acknowledgement/delivery state
```

### 8.2 Integrity rules

- Tenant-owned records require explicit ownership. Child rows without `institution_id` must inherit scope through a verified parent relationship.
- All foreign IDs submitted by clients must be validated for school, branch where applicable, and relevant session/roster.
- Enforce business uniqueness in database constraints, not only pre-insert lookup loops.
- Preserve stable identity across enrollment, portal login, guardian linking, transfers, and historical reporting.
- Use exact-decimal/minor-unit financial representation and explicit currency; define rounding centrally.
- Define school timezone/date-only handling and separate audit timestamps from academic dates.
- Preserve issued documents/published grades/financial events as versioned history; corrections must not erase evidence.
- Run explicit versioned migrations for existing databases. Current initialization creates supplementary homework/gradebook schemas only on the fresh-database path; old databases need verified upgrade coverage.
- File data currently can be stored in database text/base64 fields. Define limits, MIME validation, secure rendering, backup impact, and whether managed object storage is needed for hosted scale.
- Reconcile legacy and current attendance, guardian-link, result, and role schemas before broad data imports.

## 9. Security and correctness findings requiring action

These are source-observed risks, not an exhaustive penetration-test report.

| ID | Priority | Finding and evidence | Required action |
|---|---|---|---|
| R-01 | P0 | `src/database/ensure-admin.ts` creates/resets platform admin credentials to a hardcoded value on boot and logs bootstrap credentials. | Remove fixed credentials/reset behavior; rotate deployed credentials and investigate existing exposure. Do not reproduce values in deployment docs. |
| R-02 | P0 | `src/routes/reports.ts` `/custom` accepts arbitrary SELECT for institution admins without adding tenant scope. | Remove/restrict arbitrary SQL; implement tenant-bound reports and regression tests. |
| R-03 | P0 | Tenant middleware exists, but several object mutations only look up by ID: marks write, gradebook submit/approve/reject, library issue/return, and payroll paths are examples. | Audit every route and referenced ID, including same-school role restrictions; add two-tenant negative tests. |
| R-04 | P0 | Student create/update and several other mutations lack specific role/permission middleware; frontend protection only checks login globally. | Deny-by-default action policies and consistent object-level authorization. |
| R-05 | P0 | Student/parent portal payment entries become completed payments immediately in `fees.ts`; no independent verification. | Pending claims or verified gateway flow; authorize settlement and receipt issuance. |
| R-06 | P0 | Mixed currency fields coexist with unseparated totals and no demonstrated invoice/payment FX settlement. | Same-currency enforcement or explicit FX ledger; currency-aware reporting. |
| R-07 | P0 | `reports.ts` backup endpoint writes completed metadata without producing backup data. | Real backup creation, verification, restore and recovery drill. |
| R-08 | P0 | `src/index.ts` ultimately permits unapproved CORS origins; auth modules include a fallback JWT secret; authentication/client debug logs print token prefixes. | Exact origin policy, required secrets loaded before use, redacted logs, throttling/security headers. CORS is not a substitute for API authorization. |
| R-09 | P0 | Authentication/check flows can auto-provision production entitlement; demo guards are not consistently applied; demo routes lack the expected auth pipeline. | Central entitlement policy, guarded onboarding/recovery, authoritative server limits. |
| R-10 | P1 | Active admissions API has status changes but no final enrollment operation; application-new route uses enquiry form. | Complete application-to-student workflow and UAT. |
| R-11 | P1 | Active messaging handlers mark inserts sent without provider delivery. | Truthful statuses; provider integration before claiming delivery. |
| R-12 | P0 | Current source/backend and installed frontend fail type checks; historical build outputs exist. | Restore clean reproducible builds before publishing another release; identify artifacts by commit/version/checksum. |
| R-13 | P1 | `neon-db.ts` synchronously waits for queries, disables PostgreSQL TLS certificate verification, and logs remaining schema failures without necessarily aborting initialization. | Validate TLS, fail unsafe migrations, test SQL parity/recovery, and profile concurrency; consider async persistence layer. |
| R-14 | P0 | `purgeRecords.ts` performs broad hard deletion and temporarily disables SQLite foreign keys; generic record edits can alter financial statuses. | Retention-safe lifecycle, controlled corrections, transaction/invariant checks, audited exceptional purge. |
| R-15 | P1 | CI uses Node 20 despite Node 24 manifests; lint step only echoes success; test suite not invoked by a standard package script. | Pin supported runtime and enforce real type/lint/test/security checks. |
| R-16 | P1 | Some report/dashboard helpers catch SQL failures and return zeros/empty data. | Separate unavailable/error from a legitimate zero and alert operators. |
| R-17 | P1 | Packaged local backend does not specify a loopback bind; bootstrap has an early-return path before offline-school recovery. | Loopback binding and idempotent, independently recoverable local setup. |

## 10. Nonfunctional requirements

All numeric targets below are proposals requiring sign-off and measurement in representative hosted and desktop environments.

| Area | Requirement / proposed acceptance target |
|---|---|
| Security | No unresolved critical/high issues affecting identity, tenant privacy, grades, payments, or backups. Automated object/action/tenant negative tests. TLS and validated certificates for remote connections. |
| Privacy | Document controller/processor responsibilities, minors/guardian consent, medical-data access, retention, data export/deletion policy, and applicable Liberian/customer legal obligations with qualified review. |
| Performance | For an agreed pilot dataset (initially 1,000 students/school), p95 ordinary reads ≤2 seconds and transactional saves ≤3 seconds under agreed concurrent load; measure cloud cold starts separately. |
| Capacity | Validate at least 10 tenant schools and 50 concurrent active hosted sessions before advertising that tier. Final capacity depends on hosting and persistence design; not currently demonstrated. |
| Availability | Hosted monthly target 99.5% excluding agreed maintenance; actionable dependency health/readiness checks and alerting. |
| Recovery | Proposed cloud RPO ≤24 hours and RTO ≤4 hours; more frequent finance recovery checkpoints where feasible. Desktop automatic daily backup plus backup-before-upgrade and operator-selected external copy. |
| Data consistency | Transactions and idempotency for enrollment, billing, payments, stock, payroll, and promotion; no silent partial success. |
| Offline | Desktop core workflows use local data without Internet after setup/activation. Messaging, remote support, remote revocation, and update discovery disclose their connectivity requirements. Web offline editing is not promised. |
| Usability | Clear role dashboard, selected-school indicator, searchable/filterable lists, pagination, empty/loading/error states, confirmations, and recoverable form errors. |
| Accessibility | Target WCAG 2.1 AA for core web workflows: keyboard access, labels, focus, contrast, non-color status cues, readable tables/documents. |
| Compatibility | Approve browser/OS/architecture matrix; test current supported Chrome/Edge/Firefox and required Safari versions. Desktop claims limited to tested package targets. |
| Observability | Structured redacted logs, request IDs, actionable exceptions, failed job/migration alerts, audit coverage; health must report database failure rather than unconditional success. |
| Maintainability | Standard test/type/lint scripts, locked reproducible installation, dependency/security scanning, versioned migrations, configuration validation, documented API contracts. |
| Document quality | School/period/currency identity visible; consistent preview/print/PDF/export; safe HTML/file content and no unauthorized PII leakage. |

## 11. Deployment, setup, and operational needs

### 11.1 Decisions required before deployment

1. Select the canonical hosted topology: same-origin Vercel + Neon, or a deliberately configured web client + persistent Render API. Avoid two independently authoritative production databases.
2. Confirm supported runtime (currently declared Node 24), dependency lockfiles, native SQLite build strategy, and Electron target architectures.
3. Define development/staging/production separation, migration permissions, and a rollback/backup strategy.
4. Define production secret management for JWT, PostgreSQL, license issuer, signing, providers, and CI. Never ship issuer private keys in desktop packages.
5. Approve domain/DNS/TLS management and institution-code ownership for school portals.
6. Establish support ownership, monitoring, backups/restore drills, and incident/security response.

### 11.2 Required configuration inventory

| Configuration | Purpose / requirement |
|---|---|
| `NODE_ENV`, `PORT` | Execution mode and service port; development frontend fallback expects API port 3001 while root backend defaults to 10000, so align explicitly. |
| `DATABASE_URL` | Hosted PostgreSQL connection; verify driver selection and certificate policy. Never use a live URL in isolated tests. |
| `DB_PATH` | Authoritative SQLite path and persistent volume location when using SQLite; create/validate writable parent directory. |
| `JWT_SECRET` | Required strong secret; no production fallback. Ensure loaded before auth modules evaluate it. |
| `LICENSE_PRIVATE_KEY` | Server-side license issuer secret; restrict to trusted issuance environment. |
| `CORS_ORIGINS` | Exact approved origins if a cross-origin topology is used. |
| `VITE_API_URL` | Build-time API value, subject to current same-origin production resolver; document supported behavior. |
| `ELECTRON_MODE` | Desktop mode and offline bootstrap behavior; keep local/cloud database selection deliberate. |
| Signing/provider/CI secrets | Add only for approved deployment paths and integrations; document names and scope without storing values in source. |

### 11.3 School onboarding checklist

- School legal/display name, institution code, contacts, address, timezone, branches, logo/colors, and document signatures.
- Academic year/terms, grade levels/class order, sections/capacity, subjects, teaching assignments, grading and promotion policy.
- Student/guardian/staff import templates, source-data cleanup, duplicate matching, historical records, and opening balances.
- Fee types/structures/discount approval, USD/LRD settlement policy, authorized collectors, receipt/verification procedures.
- User-role matrix and secure credential handover; minimum-necessary access to medical, salary, and guardian data.
- License/subscription terms, selected deployment mode, backups, support contacts, training and UAT sign-off.

### 11.4 Engineering and operational capabilities needed

Assign accountable owners for product/education policy, full-stack implementation, database/security hardening, QA automation/UAT, deployment/desktop releases, finance/payroll policy, and customer onboarding/support. This is a capability list, not a required headcount estimate.

Before each release: clean checkout/install → type checks → real lint → unit/integration/tenant tests → builds → migration tests → artifact scan/signing → staging/pilot smoke tests → backup/rollback readiness → approved release. Existing workflow YAML requires repair before it can serve as this gate.

## 12. Prioritized delivery plan

No calendar estimate is asserted; sequence is dependency-driven. Engineering should size each work package after the policy decisions below.

| Stage | Work | Exit condition |
|---|---|---|
| 0 — Baseline | Approve this PRD, runtime and canonical source/deployment; restore clean installs/type checks; standard test scripts; identify artifact provenance. | Reproducible green validation on supported runtime; scope/access matrix accepted. |
| 1 — Security and integrity | Remove/reset bootstrap credentials; rotate exposed secrets; close custom SQL/tenant/action gaps; secure CORS/logging; prevent unverified settlement/mixed-currency corruption; control destructive deletion. | All P0 security/financial negative tests pass; no routine irreversible loss paths. |
| 2 — Recovery and entitlement | Real backups/restores, explicit migrations, license state machine, authenticated activation/recovery, accurate health/error reporting. | Restore drill and expired/revoked/trial tests pass on both persistence modes. |
| 3 — Core school workflow | Complete admissions/enrollment, authoritative grading/publication, promotion/session rollover, invoice/verified payment reconciliation, portal permissions. | End-to-end school UAT passes with realistic data. |
| 4 — Operational completion | Payroll/library/inventory/transport/reception hardening; truthful messaging/provider work; document and import coverage. | Module owners approve UAT, privacy, and audit coverage. |
| 5 — Distribution and pilot | Hosted capacity/security tests, clean-machine signed desktop installs/upgrades, training/runbooks, two-week pilot. | Product owner, school leadership, QA, and operations approve rollout. |

P2 work after stabilization may include approved synchronization, subscription checkout/resellers, automated desktop update installation, richer analytics, or new education segments. Each needs its own requirements and data/security design.

## 13. Release validation and definition of done

### 13.1 Mandatory test scenarios

1. **Two-tenant isolation:** Read/write/export/report/link/import attempts across School A/B, including a valid object ID belonging to the other school and platform context switching.
2. **Role enforcement:** Student/parent cannot create students, edit marks, approve results, inspect payroll, confirm payment, delete records, or bypass hidden menus through APIs.
3. **Provisioning and enrollment:** Fresh school setup; existing guardian reuse; approved application enrollment; repeat submissions; invalid document/class/reference; fee-assignment failure and recovery.
4. **Teaching:** Correct roster, timetable conflicts, attendance resave/correction, assignment submissions, lesson-plan recipients and safe files.
5. **Academic lifecycle:** Score/weight/missing-grade rules; draft invisibility; submit/reject/resubmit/approve; agreement between gradebooks/exam results/portals/report cards; promotion preview/repeat/terminal class.
6. **Finance:** Partial and concurrent payments, unverified claims, webhook replay if integrated, overpayment, reversals, cancelled invoices, discount rules, USD/LRD separation, report/receipt reconciliation.
7. **Payroll/stock/library:** Repeat processing/returns, loan deductions, branch/currency scope, negative quantity prevention, cross-school references, retained history.
8. **License lifecycle:** New school, trial cap, expiry, renewal, revoked license, signed-key tamper, offline activation, restart, local-storage manipulation, recovery without entitlement bypass.
9. **Recovery/migration:** Fresh and older SQLite/PostgreSQL schemas, interrupted upgrade, failed migration, validated backup, fresh restore, reconciliation, downgrade/rollback policy.
10. **Delivery/distribution:** Actual message sandbox delivery or explicit non-delivery UI; PDF/spreadsheet exports; browser and clean desktop install/upgrade/offline/restart; dependency and secret scans.

### 13.2 Definition of done

A requirement is done only when its acceptance tests pass, permissions and ownership are enforced server-side, migrations work on supported existing data, failures are visible/recoverable, audit/retention is correct, relevant web/desktop behavior is tested, and user/support documentation matches reality. The release additionally needs no unresolved P0s, a successful restore drill, traceable artifacts, and signed school UAT.

## 14. Stakeholder decisions and open questions

| Decision | Suggested accountable owner |
|---|---|
| Is the first supported segment primary/secondary schools only? Which institution types are genuinely required now? | Product owner / school leadership |
| Is hosted Vercel + Neon the canonical service, and is Render retained? | Technical lead / operations |
| Is desktop intentionally standalone, or is multi-device/LAN/cloud synchronization required? | Product owner / technical lead |
| What is the final role/action/branch access matrix, including principal and registrar approvals? | School leadership / security lead |
| What grades, weighting, missing-score, publication, rounding, and promotion policies apply per school? | Academic leadership |
| Should student password changes require administrator approval, and what recovery process is acceptable? | School leadership / security lead |
| Are student/parent payments gateway transactions or manual claims requiring finance verification? | Finance owner / product owner |
| Are USD/LRD balances separate, or is FX conversion supported? Who sets rates and bears rounding differences? | Finance owner |
| Which payroll taxes/contributions/leave rules are required and independently validated? | HR / finance / qualified local adviser |
| Which SMS/email providers, sender identities, consent rules, budgets, and delivery SLAs are approved? | Product owner / operations |
| What are license tiers, limits, grace/revocation/offline-device rules, and commercial renewal flows? | Commercial/product owner |
| What retention, deletion, privacy, backup locality, RPO/RTO, and customer-exit obligations apply? | Leadership / security / legal adviser |
| Which Windows/macOS/Linux versions/architectures require tested and signed distribution? | Product owner / release engineering |
| Who signs off the pilot, supports incidents, and owns ongoing training and data cleanup? | Product owner / customer success |

## 15. Source traceability and historical-document reconciliation

| Product area | Primary source evidence |
|---|---|
| Active API surface | `src/index.ts`, `src/routes/` |
| Screens, menus, homes | `frontend/src/App.tsx`, `frontend/src/components/layout/DynamicSidebar.tsx`, `frontend/src/utils/roleHome.ts` |
| Authentication/access/tenant context | `src/routes/auth.ts`, `src/middleware/auth.ts`, `src/middleware/tenant.ts`, `src/utils/userAccess.ts`, `src/routes/permissions.ts` |
| Provisioning and branding | `src/routes/platform-admin.ts`, `src/routes/settings.ts`, `frontend/src/utils/schoolHost.ts`, branding/institution contexts |
| Database and migrations | `src/database/init.ts`, `schema-v2-consolidated.ts`, `schema-homework-assignments.ts`, `schema-gradebook-lesson-perms.ts`, `schema-school-enhancements.ts`, `neon-db.ts` |
| Admission and student lifecycle | `src/routes/admission.ts`, `src/routes/students.ts`, `src/routes/parents.ts`, admission/student frontend pages |
| Teaching and academic workflow | `src/routes/teachers.ts`, `teacher-dashboard.ts`, `attendance.ts`, `assignments.ts`, `lesson-plans.ts`, `gradebook.ts`, `grade-approval.ts`, `marks.ts`, `results.ts`, `src/utils/gradesheet.ts` |
| Finance and payroll | `src/routes/fees.ts`, `accounts.ts`, `payroll.ts`, `src/utils/assignClassFees.ts`, `frontend/src/pages/fees/PortalFeesPage.tsx` |
| Operations | `src/routes/library.ts`, `inventory.ts`, `transport.ts`, `reception.ts`, `certificates.ts` |
| Messaging/reports/recovery | `src/routes/communication-simple.ts`, `notifications.ts`, `reports.ts`, frontend document/spreadsheet utilities |
| Licensing | `src/routes/licensing.ts`, `demo-mode-enforcement.ts`, `src/utils/licensing.ts`, `license-issuer.ts`, `frontend/src/contexts/LicenseContext.tsx` |
| Destructive record lifecycle | `src/routes/records.ts`, `src/utils/purgeRecords.ts` |
| Desktop and releases | `electron/main.ts`, `electron/preload.ts`, `scripts/prepare-electron-dist.js`, `electron-builder.config.js`, `.github/workflows/` |
| Hosted routing | `api/index.ts`, `vercel.json`, `render.yaml`, `frontend/src/utils/api.ts` |
| Current executable test evidence | `tests/teacher-assignments.test.ts` and the commands/results in Section 2 |

Historical `GAP_ANALYSIS.md` says multi-tenancy and admissions are missing, while active code now implements substantial portions. Conversely, `PROJECT_ROADMAP.md` and licensing summaries claim completion, refresh-token support, RSA licensing, comprehensive tests, or automatic updates beyond what the reviewed source/current verification establishes. Use this PRD as a dated baseline, and update delivered status only with source and acceptance-test evidence.

**Final recommendation:** Finish and validate the existing product rather than expand its menu. The immediate need is trustworthy tenant boundaries, verified financial records, authoritative academic publication, recoverable data, and reproducible releases.
