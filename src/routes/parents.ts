import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDatabase } from '../database/init';
import { AuthRequest, authorize } from '../middleware/auth';
import { injectTenant, requireTenant } from '../middleware/tenant';
import { generateId, generateDefaultPassword, paginate, buildSearchQuery } from '../utils/helpers';
import { ensureUserRole, ensurePortalRole } from '../utils/userAccess';
import { scopedProfile, updateProfileFields, syncProfileAccount, parentFields, profileFailure, resetProfilePassword } from '../utils/profileRecords';

export const parentsRouter = Router();

// Apply tenant middleware to ALL routes
parentsRouter.use(injectTenant);
parentsRouter.use(requireTenant);

parentsRouter.get('/', (req: AuthRequest, res: Response) => {
  const db = getDatabase();
  const { page = '1', limit = '20', search = '' } = req.query as any;
  const { limit: lim, offset } = paginate(parseInt(page), parseInt(limit));
  const { clause: searchClause, params: searchParams } = buildSearchQuery(
    ['p.first_name', 'p.last_name', 'p.phone', 'p.email'],
    search
  );

  // TENANT ISOLATION: Always filter by institution_id (platform admins see all)
  const institutionFilter = req.institution_id ? `p.institution_id = '${req.institution_id}'` : '1=1';
  const where = `WHERE ${institutionFilter} ` + searchClause;
  const params: any[] = [...searchParams];
  const total = db.prepare(`SELECT COUNT(*) as count FROM parents p ${where}`).get(...params) as any;

  const parents = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM student_parents sp WHERE sp.parent_id = p.id) as children_count
    FROM parents p
    ${where}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, lim, offset);

  res.json({ data: parents, total: total.count, page: parseInt(page), limit: lim });
});

parentsRouter.get('/:id', (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const db = getDatabase();

  // TENANT ISOLATION: Filter by institution_id (platform admins see all)
  const institutionFilter = req.institution_id ? `AND institution_id = '${req.institution_id}'` : '';
  const parent = db.prepare(`SELECT * FROM parents WHERE id = ? ${institutionFilter}`).get(id) as any;
  if (!parent) {
    res.status(404).json({ error: 'Parent not found' });
    return;
  }

  // TENANT ISOLATION: Filter related students (platform admins see all)
  const childInstitutionFilter = req.institution_id ? `AND s.institution_id = '${req.institution_id}'` : '';
  const children = db.prepare(`
    SELECT s.id, s.admission_number, s.first_name, s.last_name, s.photo, s.status,
           c.name as class_name, sec.name as section_name
    FROM students s
    JOIN student_parents sp ON s.id = sp.student_id
    LEFT JOIN classes c ON s.class_id = c.id
    LEFT JOIN sections sec ON s.section_id = sec.id
    WHERE sp.parent_id = ? ${childInstitutionFilter}
  `).all(id);

  try { scopedProfile(db, req, 'parents', id); } catch (error) { profileFailure(res, error); return; }
  res.json({ ...parent, children, username: parent.user_id ? db.prepare('SELECT username FROM users WHERE id = ? AND institution_id = ?').get(parent.user_id, parent.institution_id)?.username : null });
});

parentsRouter.post('/', (req: AuthRequest, res: Response) => {
  const { first_name, last_name, relationship, phone, email, address, occupation, workplace, student_id, photo } = req.body;

  if (!first_name || !last_name) {
    res.status(400).json({ error: 'First name and last name are required' });
    return;
  }

  const db = getDatabase();
  const id = generateId();
  const userId = generateId();
  const temporary_password = generateDefaultPassword();
  let finalUsername = email
    ? String(email).split('@')[0].toLowerCase().replace(/[^a-z0-9._]/g, '')
    : `parent.${first_name}.${last_name}`.toLowerCase().replace(/\s+/g, '');
  if (!finalUsername) finalUsername = `parent${Date.now()}`;
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(finalUsername);
  if (existing) finalUsername = `${finalUsername}${Math.floor(Math.random() * 1000)}`;

  const transaction = db.transaction(() => {
    // TENANT ISOLATION: Include institution_id in INSERT
    db.prepare(`
      INSERT INTO parents (id, institution_id, first_name, last_name, relationship, phone, email, address, occupation, workplace, photo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.institution_id, first_name, last_name, relationship || 'guardian', phone || null, email || null, address || null, occupation || null, workplace || null, photo || null);

    if (student_id) {
      db.prepare('INSERT INTO student_parents (student_id, parent_id, is_primary) VALUES (?, ?, 0)').run(student_id, id);
    }

    let parentRoleId = ensurePortalRole(req.institution_id, 'parent', 'Parent');

    db.prepare(`
      INSERT INTO users (
        id, institution_id, branch_id, username, email, password_hash,
        first_name, last_name, phone, avatar, role_id, user_type,
        linked_entity_type, linked_entity_id, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'parent', 'parent', ?, 1)
    `).run(
      userId,
      req.institution_id,
      req.user?.branch_id || null,
      finalUsername,
      email || `${finalUsername}@parent.local`,
      bcrypt.hashSync(temporary_password, 10),
      first_name,
      last_name,
      phone || null,
      photo || null,
      parentRoleId,
      id
    );
    ensureUserRole(userId, parentRoleId, true);
    db.prepare('UPDATE parents SET user_id = ? WHERE id = ?').run(userId, id);

    if (student_id) {
      db.prepare(`
        INSERT OR IGNORE INTO parent_students (id, institution_id, parent_id, student_id, relationship, is_primary)
        VALUES (?, ?, ?, ?, ?, 0)
      `).run(generateId(), req.institution_id, userId, student_id, relationship || 'guardian');
    }
  });

  transaction();
  res.status(201).json({
    id,
    username: finalUsername,
    temporary_password,
    message: 'Parent created successfully',
  });
});

parentsRouter.put('/:id', authorize('platform_admin', 'institution_admin', 'registrar'), (req: AuthRequest, res: Response) => {
  const db = getDatabase();
  try {
    db.transaction(() => {
      const parent = scopedProfile(db, req, 'parents', req.params.id);
      updateProfileFields(db, 'parents', parent.id, req.institution_id!, req.body, parentFields);
      syncProfileAccount(db, 'parents', parent.id, req.institution_id!, parent.email);
      if (req.body.relationship && parent.user_id) db.prepare('UPDATE parent_students SET relationship = ? WHERE parent_id = ? AND institution_id = ?').run(req.body.relationship, parent.user_id, req.institution_id);
    })();
    res.json({ message: 'Parent updated successfully' });
  } catch (error) { profileFailure(res, error); }
});

parentsRouter.post('/:id/reset-password', authorize('platform_admin', 'institution_admin', 'registrar'), resetProfilePassword('parents'));

parentsRouter.post('/:id/link-student', (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { student_id, is_primary } = req.body;

  if (!student_id) {
    res.status(400).json({ error: 'Student ID is required' });
    return;
  }

  const db = getDatabase();
  db.prepare('INSERT OR IGNORE INTO student_parents (student_id, parent_id, is_primary) VALUES (?, ?, ?)').run(student_id, id, is_primary ? 1 : 0);
  res.json({ message: 'Student linked to parent successfully' });
});
