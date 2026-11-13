import bcrypt from 'bcryptjs';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getDatabase } from '../database/init';
import { generateId, generateDefaultPassword } from './helpers';
import { ensurePortalRole, ensureUserRole, getMergedAccessForUser } from './userAccess';

export function profileError(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
export function profileFailure(res: Response, error: any) {
  const conflict = /unique|duplicate key/i.test(String(error.message));
  res.status(error.status || (conflict ? 409 : 500)).json({ error: error.status ? error.message : conflict
    ? 'That email or identifier is already used by another account' : 'Could not save this record. No changes were committed.' });
}

export function scopedProfile(db: any, req: AuthRequest, table: 'students' | 'parents' | 'employees', id: string) {
  if (!req.institution_id) profileError('Select a school first');
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND institution_id = ?`).get(id, req.institution_id);
  if (!row) profileError('Record not found', 404);
  if (req.user?.branch_id) {
    const allowed = table === 'parents'
      ? db.prepare(`SELECT p.id FROM parents p WHERE p.id = ? AND p.institution_id = ? AND (
          EXISTS (SELECT 1 FROM users u WHERE u.id = p.user_id AND u.institution_id = p.institution_id AND u.branch_id = ?)
          OR EXISTS (SELECT 1 FROM student_parents sp JOIN students s ON s.id = sp.student_id
            WHERE sp.parent_id = p.id AND s.institution_id = p.institution_id AND s.branch_id = ?))`).get(id, req.institution_id, req.user.branch_id, req.user.branch_id)
      : row.branch_id === req.user.branch_id;
    if (!allowed) profileError('Record not found in your assigned branch', 404);
  }
  return row;
}

// Only callers' explicit column allowlists are used in SQL. Missing fields stay
// unchanged; empty optional fields are cleared rather than silently retained.
export function updateProfileFields(db: any, table: string, id: string, institution: string, body: any, fields: string[]) {
  const keys = fields.filter(key => Object.prototype.hasOwnProperty.call(body, key));
  if (!keys.length) return;
  for (const key of ['first_name', 'last_name']) {
    if (keys.includes(key) && (typeof body[key] !== 'string' || !body[key].trim())) profileError('First and last names are required');
  }
  if (keys.includes('gender') && body.gender && !['male', 'female', 'other'].includes(body.gender)) profileError('Invalid gender');
  if (keys.includes('relationship') && !['father', 'mother', 'guardian', 'other'].includes(body.relationship)) profileError('Invalid guardian relationship');
  db.prepare(`UPDATE ${table} SET ${keys.map(key => `${key} = ?`).join(', ')}, updated_at = datetime('now')
    WHERE id = ? AND institution_id = ?`).run(...keys.map(key => body[key] === '' ? null : body[key]), id, institution);
}

export function syncProfileAccount(db: any, table: 'students' | 'parents' | 'employees', id: string, institution: string, previousEmail?: string | null) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND institution_id = ?`).get(id, institution);
  if (!row?.user_id) return;
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND institution_id = ?').get(row.user_id, institution);
  const expected = table === 'students' ? 'student' : table === 'parents' ? 'parent' : 'teacher';
  if (!user || user.user_type !== expected || (user.linked_entity_id && user.linked_entity_id !== id)) profileError('Linked account does not match this record', 409);
  let loginEmail = user.email || `${user.username}@${expected}.local`;
  if (row.email && row.email !== previousEmail) {
    if (db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?').get(row.email, user.id)) profileError('That email is already used by another login account', 409);
    loginEmail = row.email;
  }
  db.prepare(`UPDATE users SET first_name = ?, last_name = ?, phone = ?, avatar = ?, email = ?,
    branch_id = ?, updated_at = datetime('now') WHERE id = ? AND institution_id = ?`).run(
    row.first_name, row.last_name, row.phone || null, row.photo || null,
    loginEmail, table === 'parents' ? user.branch_id : row.branch_id || null, user.id, institution);
}

export function validateStudentPlacement(db: any, req: AuthRequest, row: any) {
  for (const [table, value] of [['classes', row.class_id], ['branches', row.branch_id], ['academic_sessions', row.session_id]]) {
    if (value && !db.prepare(`SELECT id FROM ${table} WHERE id = ? AND institution_id = ?`).get(value, req.institution_id)) profileError('Class, branch and session must belong to this school');
  }
  if (req.user?.branch_id && row.branch_id !== req.user.branch_id) profileError('Use your assigned branch', 403);
  const cls = row.class_id ? db.prepare('SELECT branch_id FROM classes WHERE id = ? AND institution_id = ?').get(row.class_id, req.institution_id) : null;
  if (cls?.branch_id && cls.branch_id !== row.branch_id) profileError('Class must belong to the selected branch');
  if (row.section_id && !db.prepare('SELECT id FROM sections WHERE id = ? AND class_id = ? AND institution_id = ?').get(row.section_id, row.class_id, req.institution_id)) profileError('Section must belong to the selected class');
}

export const parentFields = ['first_name', 'last_name', 'relationship', 'phone', 'email', 'address', 'occupation', 'workplace', 'photo'];
export function saveGuardian(db: any, req: AuthRequest, input: any, studentId: string) {
  let id = input.id;
  let previousEmail: string | null | undefined;
  let credentials: { username: string; temporary_password: string } | undefined;
  if (id) {
    if (!db.prepare(`SELECT p.id FROM parents p JOIN student_parents sp ON sp.parent_id = p.id
      WHERE p.id = ? AND p.institution_id = ? AND sp.student_id = ?`).get(id, req.institution_id, studentId)) profileError('Guardian is not linked to this student');
    previousEmail = db.prepare('SELECT email FROM parents WHERE id = ? AND institution_id = ?').get(id, req.institution_id).email;
    updateProfileFields(db, 'parents', id, req.institution_id!, input, parentFields);
  } else {
    if (!input.first_name || !input.last_name) profileError('Guardian first and last names are required');
    id = generateId(); const userId = generateId();
    const username = `parent.${generateId()}`;
    const password = generateDefaultPassword();
    const role = ensurePortalRole(req.institution_id, 'parent', 'Parent');
    db.prepare(`INSERT INTO users (id, institution_id, branch_id, username, email, password_hash, first_name, last_name,
      role_id, user_type, linked_entity_type, linked_entity_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'parent', 'parent', ?)`).run(
      userId, req.institution_id, req.user?.branch_id || null, username, `${username}@parent.local`, bcrypt.hashSync(password, 10), input.first_name, input.last_name, role, id);
    ensureUserRole(userId, role, true);
    db.prepare('INSERT INTO parents (id, institution_id, first_name, last_name, user_id) VALUES (?, ?, ?, ?, ?)').run(id, req.institution_id, input.first_name, input.last_name, userId);
    updateProfileFields(db, 'parents', id, req.institution_id!, input, parentFields);
    db.prepare('INSERT INTO student_parents (student_id, parent_id, is_primary) VALUES (?, ?, 1)').run(studentId, id);
    credentials = { username, temporary_password: password };
  }
  syncProfileAccount(db, 'parents', id, req.institution_id!, previousEmail);
  const parent = db.prepare('SELECT * FROM parents WHERE id = ? AND institution_id = ?').get(id, req.institution_id);
  if (parent.user_id) {
    db.prepare(`INSERT INTO parent_students (id, institution_id, parent_id, student_id, relationship, is_primary)
      VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT (parent_id, student_id) DO UPDATE SET relationship = excluded.relationship`).run(
      generateId(), req.institution_id, parent.user_id, studentId, parent.relationship || 'guardian');
  }
  return credentials;
}

export function resetProfilePassword(table: 'students' | 'parents' | 'employees') {
  return (req: AuthRequest, res: Response) => {
    const db = getDatabase();
    try {
      const password = req.body.new_password;
      if (typeof password !== 'string' || password.length < 12 || password.length > 72 || Buffer.byteLength(password, 'utf8') > 72) profileError('Use a password of 12–72 characters (at most 72 UTF-8 bytes)');
      db.transaction(() => {
        const record = scopedProfile(db, req, table, req.params.id);
        const expected = table === 'students' ? 'student' : table === 'parents' ? 'parent' : 'teacher';
        const user = db.prepare('SELECT * FROM users WHERE id = ? AND institution_id = ?').get(record.user_id, req.institution_id);
        if (!user || user.user_type !== expected || (user.linked_entity_id && user.linked_entity_id !== record.id) || (table === 'employees' && !record.is_teacher)) profileError('Matching portal account not found', 404);
        const roles = getMergedAccessForUser(user.id, user.role_id).role_codes;
        if (roles.some(code => ![expected].includes(code))) profileError('This account has additional roles; a platform administrator must review its access', 403);
        db.prepare(`UPDATE users SET password_hash = ?, auth_version = COALESCE(auth_version, 0) + 1,
          updated_at = datetime('now') WHERE id = ? AND institution_id = ?`).run(bcrypt.hashSync(password, 12), user.id, req.institution_id);
        db.prepare(`UPDATE password_change_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now'),
          rejection_reason = 'Superseded by an authorized password reset' WHERE user_id = ? AND institution_id = ? AND status = 'pending'`).run(req.user?.id || null, user.id, req.institution_id);
        db.prepare(`INSERT INTO audit_logs (id, institution_id, user_id, action, entity_type, entity_id, module, details)
          VALUES (?, ?, ?, 'password_reset', ?, ?, 'accounts', ?)`).run(generateId(), req.institution_id, req.user?.id || null, expected, record.id,
          JSON.stringify({ account_id: user.id, existing_online_sessions_revoked: true }));
      })();
      res.setHeader('Cache-Control', 'private, no-store');
      res.json({ message: 'Password updated. Existing online sessions have been signed out.' });
    } catch (error) { profileFailure(res, error); }
  };
}
