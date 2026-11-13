# Complete profiles, standardized views and password administration

## Delivered

- Student admission and edit use the same personal/contact, photo, academic placement, admission date, previous school/class, blood group, medical information, guardian and prior-record sections. Editing no longer hides guardians or transcripts. Optional fields can be cleared; prior-record metadata/attachments can be updated or removed explicitly without silently deleting an untouched attachment. Existing guardians can be selected for editing; shared guardian changes affect their other linked children as well.
- Student saves whitelist supported admission fields, validate school/branch/class/section/session references, update the linked account identity and guardian links, and commit profile/guardian/prior-record changes together. A failed related update rolls back the entire save. Class-fee reassignment is limited to actual class/session changes and the selected session.
- Teacher edit persists employment dates as well as personal/contact/photo, branch/department/designation, qualifications, experience and employment information. Administrators/HR retain financial editing; registrar profile editing/reset authority does not grant salary or bank access.
- Parents have a complete dedicated edit screen for names, relationship, contact/address, occupation/workplace and profile photo. Account name, contact/avatar and guardian relationship links stay synchronized.
- Student, teacher and parent views use a common photo-first header, structured information cards, consistent label/value grids, responsive spacing, readable linked records, and a consistent download format. The shared `RecordView` redesign also applies to existing module views that use that component. Dialogs support Escape, keyboard focus containment/restoration, scroll locking, loading and access/error feedback.
- Mobile navigation starts closed, opens as a drawer with a dismissing backdrop, and closes on navigation. The main content no longer reserves desktop-sidebar space on phones or lets that sidebar block View actions.

## Password administration

Administrators (`platform_admin` / `institution_admin`) and registrars can open a student, parent or teacher view/edit screen → **Reset password** → enter and confirm a new password → **Update password now**.

The dedicated record-specific endpoints check role, institution/branch, record-to-account ownership and portal type. Passwords must be 12–72 characters and no more than 72 UTF-8 bytes. They are hashed with bcrypt, never returned in the reset response, cached, or written into audit records. The audit records actor and target identifiers only. Pending password-change requests are rejected when superseded by the authorized reset.

`users.auth_version` increments on these resets. Tokens include the current version; both authenticated business APIs and `/auth/me` reject earlier tokens immediately. Old passwords stop working immediately, and existing online sessions are signed out on their next server request/poll. New logins receive the new version. Accounts with extra roles are not eligible for these narrowly scoped portal resets and must be reviewed through platform account administration.

**Offline limitation:** a disconnected device cannot learn about a reset until it reconnects. Its existing time-limited offline session is not remotely erased. Profile edits and password resets remain online-only; pending offline work is preserved but requires a valid reauthenticated identity before replay.

## Deployment and validation

- The additive `auth_version INTEGER NOT NULL DEFAULT 0` migration was applied successfully to production, preview and development before deployment. Existing account passwords and IDs were not changed by migration. Unreset legacy tokens remain compatible until their normal expiration; reset accounts reject their old tokens.
- Backend/frontend type checks passed. **39 unit/regression tests passed**, including eight profile/password tests covering complete field persistence, clearable values, guardian/account synchronization, attachment preservation/removal, rollback on foreign/invalid/conflicting references, teacher financial boundaries, reset permissions, token revocation, and privileged-role protection.
- **7 browser/API checks passed** on `https://sms-aumnnsb94-itconsultantbryant-svgs-projects.vercel.app` at `2026-11-13T13:49:05.957Z`: real student edits including transcript upload; photo-first complete student details and keyboard behavior; full parent/teacher edit/view persistence; mobile layout without horizontal overflow; administrator reset; registrar resets of all three portal types with immediate old-password/token rejection; and negative authorization/password-policy checks.
- Screenshots were inspected from ignored `test-results/profiles-mobile-fix/` artifacts. Synthetic test users only were reset; no existing production student/parent/teacher password was changed.
- An earlier preview-access timeout passed no workflow checks. A later run passed three checks before exposing the mobile sidebar obstruction. These failed attempts are not counted as successful full runs. A new collision/rollback assertion also exposed missing explicit email collision validation; that validation was added, and the final 39-test run passed.
- No new exhaustive all-role/all-module acceptance run is claimed. The shared view component is standardized, but bespoke page-specific views, print/export paths and every module's access matrix still need their own acceptance review. Existing PRD/provider/backup limitations remain.

Production deployment verification is recorded separately in the validation report after publication.
