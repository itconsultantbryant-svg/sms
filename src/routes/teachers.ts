import { Router, Response } from 'express';
import { getDatabase } from '../database/init';
import { AuthRequest, authorize, hasPermission } from '../middleware/auth';
import { injectTenant, requireTenant } from '../middleware/tenant';
import { generateId, generateEmployeeId, generateDefaultPassword, paginate, buildSearchQuery } from '../utils/helpers';
import { ensureUserRole, ensurePortalRole } from '../utils/userAccess';
import bcrypt from 'bcryptjs';
import { scopedProfile, updateProfileFields, syncProfileAccount, profileFailure, profileError, resetProfilePassword } from '../utils/profileRecords';

export const teachersRouter = Router();

// Apply tenant middleware to ALL routes
teachersRouter.use(injectTenant);
teachersRouter.use(requireTenant);

function validEmployeeLinks(db: any, institution: string, values: Record<string, any>): boolean {
  return [['branch_id', 'branches'], ['department_id', 'departments'], ['designation_id', 'designations']].every(([field, table]) =>
    !values[field] || !!db.prepare(`SELECT id FROM ${table} WHERE id = ? AND institution_id = ?`).get(values[field], institution));
}

function employeeFinanceAllowed(req: AuthRequest) {
  return ['platform_admin', 'institution_admin'].includes(req.user?.user_type || '') || req.user?.role_codes?.includes('hr_manager') || req.user?.role_code === 'hr_manager' || hasPermission(req, 'payroll.view');
}
function employeeResponse(req: AuthRequest, row: any) {
  if (employeeFinanceAllowed(req)) return row;
  const { basic_salary, bank_name, bank_account, ...profile } = row;
  return profile;
}

teachersRouter.get('/', (req: AuthRequest, res: Response) => {
  const db = getDatabase();
  const { page = '1', limit = '20', search = '', branch = '', department = '', staff = '' } = req.query as any;
  const { limit: lim, offset } = paginate(parseInt(page), parseInt(limit));
  const { clause: searchClause, params: searchParams } = buildSearchQuery(
    ['e.first_name', 'e.last_name', 'e.employee_id', 'e.email'],
    search
  );

  // TENANT ISOLATION: Always filter by institution_id (null for platform admins)
  const institutionFilter = req.institution_id ? `e.institution_id = '${req.institution_id}'` : '1=1';
  const roleFilter = staff === '1' ? '(e.is_teacher = 0 OR e.is_teacher IS NULL)' : 'e.is_teacher = 1';
  let where = `WHERE ${institutionFilter} AND ${roleFilter} AND (e.is_active = 1 OR e.is_active IS NULL) ` + searchClause;
  const params: any[] = [...searchParams];

  if (branch) { where += ' AND e.branch_id = ?'; params.push(branch); }
  if (department) { where += ' AND e.department_id = ?'; params.push(department); }
  if (req.user?.branch_id) { where += ' AND e.branch_id = ?'; params.push(req.user.branch_id); }

  const total = db.prepare(`SELECT COUNT(*) as count FROM employees e ${where}`).get(...params) as any;

  const teachers = db.prepare(`
    SELECT e.*, d.name as department_name, des.name as designation_name, b.branch_name as branch_name
    FROM employees e
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN designations des ON e.designation_id = des.id
    LEFT JOIN branches b ON e.branch_id = b.id
    ${where}
    ORDER BY e.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, lim, offset);

  res.json({ data: teachers.map((row: any) => employeeResponse(req, row)), total: total.count, page: parseInt(page), limit: lim });
});

teachersRouter.get('/:id', (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const db = getDatabase();

  // TENANT ISOLATION: Filter by institution_id (null for platform admins)
  const institutionFilter = req.institution_id ? `AND e.institution_id = '${req.institution_id}'` : '';
  const teacher = db.prepare(`
    SELECT e.*, d.name as department_name, des.name as designation_name, b.branch_name as branch_name
    FROM employees e
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN designations des ON e.designation_id = des.id
    LEFT JOIN branches b ON e.branch_id = b.id
    WHERE e.id = ? ${institutionFilter}
  `).get(id) as any;

  if (!teacher) {
    res.status(404).json({ error: 'Teacher not found' });
    return;
  }
  if (req.user?.branch_id && teacher.branch_id !== req.user.branch_id) { res.status(404).json({ error: 'Teacher not found in your branch' }); return; }

  // TENANT ISOLATION: Filter assignments through employee (null for platform admins)
  const assignmentInstFilter = req.institution_id ? `AND ta.institution_id = '${req.institution_id}'` : '';
  const assignments = db.prepare(`
    SELECT ta.*, c.name as class_name, sec.name as section_name, sub.name as subject_name,
           ses.name as session_name
    FROM teacher_assignments ta
    LEFT JOIN classes c ON ta.class_id = c.id
    LEFT JOIN sections sec ON ta.section_id = sec.id
    LEFT JOIN subjects sub ON ta.subject_id = sub.id
    LEFT JOIN academic_sessions ses ON ta.session_id = ses.id
    WHERE ta.employee_id = ? ${assignmentInstFilter}
  `).all(id);

  res.json({ ...employeeResponse(req, teacher), assignments,
    username: teacher.user_id ? db.prepare('SELECT username FROM users WHERE id = ? AND institution_id = ?').get(teacher.user_id, teacher.institution_id)?.username : null });
});

teachersRouter.post('/', authorize('platform_admin', 'institution_admin', 'hr_manager'), (req: AuthRequest, res: Response) => {
  const {
    first_name, middle_name, last_name, gender, date_of_birth, phone, email,
    address, photo, department_id, designation_id, branch_id, qualification,
    experience, employment_date, employment_type, basic_salary, bank_name, bank_account,
    // User credentials
    username, password, generate_credentials
  } = req.body;

  if (!first_name || !last_name) {
    res.status(400).json({ error: 'First name and last name are required' });
    return;
  }

  const db = getDatabase();
  const id = generateId();
  const userId = generateId();
  if (!req.institution_id || !validEmployeeLinks(db, req.institution_id, { branch_id, department_id, designation_id })) {
    res.status(400).json({ error: 'Select a school and valid branch, department and designation within that school' }); return;
  }
  const employee_id = generateEmployeeId('TCH');

  // Generate credentials if requested or not provided
  let finalUsername = username;
  let finalPassword = password;

  if (generate_credentials || !username) {
    finalUsername = `${first_name.toLowerCase()}.${last_name.toLowerCase()}`.replace(/\s+/g, '');
    const usernameCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE username LIKE ?')
      .get(`${finalUsername}%`) as any;
    if (usernameCount.count > 0) {
      finalUsername = `${finalUsername}${usernameCount.count + 1}`;
    }
  }

  if (generate_credentials || !password) {
    finalPassword = generateDefaultPassword();
  }

  // Check username uniqueness
  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(finalUsername);
  if (existingUser) {
    res.status(409).json({ error: 'Username already exists', username: finalUsername });
    return;
  }

  const transaction = db.transaction(() => {
    const teacherRoleId = ensurePortalRole(req.institution_id, 'teacher', 'Teacher');
    const passwordHash = bcrypt.hashSync(finalPassword, 10);
    const loginEmail = email && String(email).trim() ? String(email).trim() : null;

    // User must exist before employees.user_id FK is set
    db.prepare(`
      INSERT INTO users (
        id, institution_id, branch_id, username, email, password_hash,
        first_name, last_name, phone, avatar, role_id, user_type,
        linked_entity_type, linked_entity_id, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'teacher', 'employee', ?, 1)
    `).run(
      userId, req.institution_id, branch_id || req.user?.branch_id || null, finalUsername, loginEmail, passwordHash,
      first_name, last_name, phone || null, photo || null, teacherRoleId, id
    );
    ensureUserRole(userId, teacherRoleId, true);

    db.prepare(`
      INSERT INTO employees (id, institution_id, employee_id, first_name, middle_name, last_name, gender,
      date_of_birth, phone, email, address, photo, department_id, designation_id, branch_id,
      qualification, experience, employment_date, employment_type, basic_salary, bank_name,
      bank_account, is_teacher, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      id, req.institution_id, employee_id, first_name, middle_name || null, last_name, gender || null,
      date_of_birth || null, phone || null, loginEmail, address || null, photo || null,
      department_id || null, designation_id || null, branch_id || req.user?.branch_id || null,
      qualification || null, experience || null, employment_date || null,
      employment_type || 'full-time', basic_salary || 0, bank_name || null, bank_account || null,
      userId
    );
  });

  try {
    transaction();

    // Return credentials to admin
    res.status(201).json({
      id,
      employee_id,
      user_id: userId,
      credentials: {
        username: finalUsername,
        password: finalPassword,
        email: email || null
      },
      message: 'Teacher created successfully. Share these credentials with the teacher.'
    });
  } catch (error: any) {
    console.error('Teacher creation error:', error);
    res.status(500).json({ error: 'Failed to create teacher', details: error.message });
  }
});

teachersRouter.put('/:id', authorize('platform_admin', 'institution_admin', 'hr_manager', 'registrar'), (req: AuthRequest, res: Response) => {
  const db = getDatabase();
  try {
    db.transaction(() => {
      const teacher = scopedProfile(db, req, 'employees', req.params.id);
      if (!teacher.is_teacher) profileError('Teacher not found', 404);
      const next = { ...teacher, ...req.body };
      if (!validEmployeeLinks(db, req.institution_id!, next)) profileError('Branch, department and designation must belong to this school');
      if (req.user?.branch_id && next.branch_id !== req.user.branch_id) profileError('Use your assigned branch', 403);
      if (req.body.basic_salary != null && (!Number.isFinite(Number(req.body.basic_salary)) || Number(req.body.basic_salary) < 0)) profileError('Salary must be a non-negative number');
      const finance = ['basic_salary', 'bank_name', 'bank_account'];
      const canEditFinance = ['platform_admin', 'institution_admin'].includes(req.user?.user_type || '') || req.user?.role_code === 'hr_manager' || req.user?.role_codes?.includes('hr_manager');
      if (!canEditFinance && finance.some(key => Object.prototype.hasOwnProperty.call(req.body, key))) profileError('HR authorization is required to edit salary or bank details', 403);
      updateProfileFields(db, 'employees', teacher.id, req.institution_id!, req.body, ['first_name', 'middle_name', 'last_name', 'gender',
        'date_of_birth', 'phone', 'email', 'address', 'photo', 'department_id', 'designation_id', 'branch_id', 'qualification', 'experience',
        'employment_date', 'employment_type', 'is_active', ...finance]);
      syncProfileAccount(db, 'employees', teacher.id, req.institution_id!, teacher.email);
    })();
    res.json({ message: 'Teacher updated successfully' });
  } catch (error) { profileFailure(res, error); }
});

teachersRouter.post('/:id/reset-password', authorize('platform_admin', 'institution_admin', 'registrar'), resetProfilePassword('employees'));

teachersRouter.post('/:id/assignments', authorize('platform_admin', 'institution_admin'), (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { class_id, section_id, subject_id, session_id, is_class_teacher, class_ids, subject_ids } = req.body;
  const classes = [...new Set(Array.isArray(class_ids) && class_ids.length ? class_ids : class_id ? [class_id] : [])];
  const subjects = [...new Set(Array.isArray(subject_ids) && subject_ids.length ? subject_ids : subject_id ? [subject_id] : [])];

  if (!classes.length || !subjects.length) {
    res.status(400).json({ error: 'Select at least one class and one subject' });
    return;
  }
  if (!req.institution_id) {
    res.status(400).json({ error: 'Select a school before assigning a teacher' });
    return;
  }

  const db = getDatabase();
  const session = session_id || (db.prepare('SELECT id FROM academic_sessions WHERE institution_id = ? AND is_current = 1 LIMIT 1').get(req.institution_id) as any)?.id || null;
  const teacher = db.prepare('SELECT id FROM employees WHERE id = ? AND institution_id = ? AND is_teacher = 1 AND is_active = 1').get(id, req.institution_id);
  if (!teacher) { res.status(404).json({ error: 'Active teacher not found in this school' }); return; }
  if (!session || !db.prepare('SELECT id FROM academic_sessions WHERE id = ? AND institution_id = ?').get(session, req.institution_id)) {
    res.status(400).json({ error: 'Select a valid academic session for this school' }); return;
  }
  if (classes.length > 100 || subjects.length > 100 || [...classes, ...subjects].some(value => typeof value !== 'string')) {
    res.status(400).json({ error: 'Invalid class or subject selection' }); return;
  }
  if (section_id && (classes.length !== 1 || !db.prepare('SELECT id FROM sections WHERE id = ? AND class_id = ? AND institution_id = ?').get(section_id, classes[0], req.institution_id))) {
    res.status(400).json({ error: 'The section must belong to the selected class and school' }); return;
  }
  for (const cid of classes) {
    if (!db.prepare('SELECT id FROM classes WHERE id = ? AND institution_id = ? AND is_active = 1').get(cid, req.institution_id)) {
      res.status(400).json({ error: 'A selected class is inactive or belongs to another school' }); return;
    }
    for (const sid of subjects) {
      if (!db.prepare('SELECT id FROM subjects WHERE id = ? AND institution_id = ? AND is_active = 1').get(sid, req.institution_id)) {
        res.status(400).json({ error: 'A selected subject is inactive or belongs to another school' }); return;
      }
      if (!db.prepare('SELECT id FROM class_subjects WHERE institution_id = ? AND class_id = ? AND subject_id = ? AND (session_id = ? OR session_id IS NULL)').get(req.institution_id, cid, sid, session)) {
        res.status(400).json({ error: 'Map every selected subject to every selected class in this academic session before assigning the teacher' }); return;
      }
    }
  }
  const created: string[] = [];
  try {
    const insert = db.prepare(`
      INSERT INTO teacher_assignments (id, institution_id, employee_id, class_id, section_id, subject_id, session_id, is_class_teacher)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
    `);
    const assign = db.transaction(() => { for (const cid of classes) {
      for (const sid of subjects) {
        const existing = db.prepare(`
          SELECT id FROM teacher_assignments
          WHERE employee_id = ? AND class_id = ? AND subject_id = ? AND institution_id = ?
            AND COALESCE(section_id, '') = COALESCE(?, '') AND COALESCE(session_id, '') = COALESCE(?, '')
        `).get(id, cid, sid, req.institution_id, section_id || null, session) as any;
        if (existing) continue;
        const assignId = generateId();
        const result = insert.run(assignId, req.institution_id, id, cid, section_id || null, sid, session, is_class_teacher ? 1 : 0);
        if (result.changes) created.push(assignId);
      }
    } });
    assign();
    res.status(201).json({ ids: created, count: created.length, message: created.length ? 'Assignments created' : 'Those class and subject assignments already exist' });
  } catch (err: any) {
    console.error('Teacher assignment error:', err);
    res.status(500).json({ error: 'Failed to assign classes and subjects', details: err.message });
  }
});

teachersRouter.delete('/:id/assignments/:assignmentId', authorize('platform_admin', 'institution_admin'), (req: AuthRequest, res: Response) => {
  const { id, assignmentId } = req.params;
  const db = getDatabase();
  // TENANT ISOLATION: Verify ownership before delete (null for platform admins)
  const result = db.prepare('DELETE FROM teacher_assignments WHERE id = ? AND employee_id = ? AND institution_id = ?').run(assignmentId, id, req.institution_id);
  if (!result.changes) { res.status(404).json({ error: 'Assignment not found for this teacher and school' }); return; }
  res.json({ message: 'Assignment removed successfully' });
});
