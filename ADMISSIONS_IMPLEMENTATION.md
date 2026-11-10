# Admissions → enrollment implementation

## Delivered

- `/admission/applications/new` now opens a real application form rather than creating an enquiry. A new application-detail route shows the guardian, placement, review controls and enrollment action.
- The API uses the active consolidated schema: `desired_class_id`, `desired_section_id`, `desired_session_id`, normalized `application_parents`, and supported workflow statuses. No schema migration or data deletion was needed.
- New applications are stored as `submitted`; the existing UI's `pending` label represents draft/submitted records. `admitted` is derived from the committed student link, not written as an unsupported database status.
- Review/approval/rejection require an authorized administrator/principal. Enrollment additionally requires `students.create`, an approved application, a class, a session and guardian contact data. Portal users cannot access admissions records through this router.
- Placement references are school-scoped. Application details, review and enrollment enforce an assigned branch; class/section placement is validated again by shared student-creation logic.
- Enquiry conversion creates the normalized application and primary guardian together. Repeated/concurrent enquiry conversions cannot create a second application.
- `POST /api/admission/applications/:id/enroll` locks the application through a transactional conditional update before checking its approval/link. Student creation, student/guardian accounts, both guardian-link tables, configured fee assignment, audit entry, and application linkage commit in one transaction. A billing failure rolls everything back.
- Repeat enrollment returns the existing student ID without generating accounts, invoices or credentials again. Concurrent hosted requests are serialized by the database row lock, not an in-process flag.
- Review and enrollment audits contain actor/status/record IDs and placement, not passwords. First-enrollment credentials are returned once with `private, no-store` and held only in component memory; they are hidden on navigation/reload. A lost response requires the existing account-recovery workflow rather than replaying stored passwords.
- Direct enrollment uses the same student-creation logic and now rolls back if fee assignment fails instead of reporting a partial admission. When a session is supplied, only matching session fee structures are assigned.

## Verification and scope

- Backend/frontend type checks passed.
- **31 unit/regression tests passed**, including seven new admissions tests covering canonical persistence, approval, guardian portals, session billing, repeat conversion, tenant/branch rejection, transactional rollback, enquiry conversion and permission boundaries.
- The first preview browser attempt stopped at a strict class-selector lookup before submitting an application. Explicit accessible names were added to placement selectors; this attempt is not a pass.
- A second attempt stopped because the runner tried to change an intentionally locked assigned-branch selector. The runner now verifies that locked value against the fixture's class branch rather than bypassing the restriction. Neither attempt is counted as successful workflow evidence.
- The latest preview passed **6 offline** and **5 teacher-assignment** browser/API regression checks again.
- The corrected runner passed **5 admissions browser/Neon checks** on `https://sms-8ywd3r8u8-itconsultantbryant-svgs-projects.vercel.app`, including real form creation, authorization rejection, UI review/approval/enrollment, committed student/guardian/invoices with credential-free retry, and concurrent enrollment creating one student and invoice set. The latest list-page role-based button visibility was subsequently type-checked; it does not change the API workflow tested on that preview.
- No new single broad all-role rerun was performed. Do not interpret prior release results as certification of this iteration.

This is the core application/review/enrollment path, not completion of the entire admissions or security PRD. Existing application documents remain attached to the source application; document upload/verification, application-fee settlement, capacity/waitlist/interview policy, duplicate-person review/guardian-account reuse, editing submitted identity/contact fields, exhaustive branch-scoping of older enquiry/dashboard endpoints, and legacy desktop schema compatibility still require separate acceptance work. Admission creation, approval and enrollment remain online-only. External providers, full desktop/cloud replication, promotion/licensing policy and recoverable application backups remain outstanding.
