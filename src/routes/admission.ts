import { Router, Response } from 'express';
import { getDatabase } from '../database/init';
import { AuthRequest, authorize, requirePermission } from '../middleware/auth';
import { injectTenant, requireTenant } from '../middleware/tenant';
import { generateId, paginate } from '../utils/helpers';
import { createStudentEnrollment } from './students';

export const admissionRouter = Router();

// Apply tenant middleware to ALL admission routes
admissionRouter.use(injectTenant);
admissionRouter.use(requireTenant);
admissionRouter.use(authorize('platform_admin', 'institution_admin', 'principal', 'registrar', 'receptionist'));

function inputError(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function validatePlacement(db: any, institutionId: string, input: any) {
  for (const [table, value] of [['classes', input.class_id], ['academic_sessions', input.session_id], ['branches', input.branch_id]]) {
    if (value && !db.prepare(`SELECT id FROM ${table} WHERE id = ? AND institution_id = ?`).get(value, institutionId)) {
      inputError('Class, academic session and branch must belong to this school');
    }
  }
  const cls = input.class_id ? db.prepare('SELECT branch_id FROM classes WHERE id = ? AND institution_id = ?').get(input.class_id, institutionId) : null;
  if (cls?.branch_id && cls.branch_id !== input.branch_id) inputError('Class must belong to the selected branch');
  if (input.section_id && !db.prepare('SELECT id FROM sections WHERE id = ? AND institution_id = ? AND class_id = ?').get(input.section_id, institutionId, input.class_id)) {
    inputError('Section must belong to the selected class and school');
  }
}

function checkBranch(req: AuthRequest, record: any) {
  if (req.user?.branch_id && record.branch_id !== req.user.branch_id) inputError('Record not found in your assigned branch', 404);
}

function presentApplication(row: any) {
  return { ...row, class_id: row.desired_class_id, section_id: row.desired_section_id,
    session_id: row.desired_session_id,
    status: row.converted_to_student_id ? 'admitted' : ['draft', 'submitted'].includes(row.status) ? 'pending' : row.status };
}

function saveApplication(db: any, req: AuthRequest, input: any, enquiryId: string | null = null) {
  if (!req.institution_id) inputError('Select a school');
  const branchId = input.branch_id || req.user?.branch_id || null;
  validatePlacement(db, req.institution_id, { ...input, branch_id: branchId });
  if (req.user?.branch_id && branchId !== req.user.branch_id) inputError('Use your assigned branch', 403);
  const parentName = String(input.parent_name || '').trim().split(/\s+/);
  const parent = input.parent || { first_name: parentName[0], last_name: parentName.slice(1).join(' '),
    phone: input.parent_phone, email: input.parent_email, address: input.parent_address, occupation: input.parent_occupation };
  if (!input.first_name?.trim() || !input.last_name?.trim() || !parent.first_name?.trim() || !parent.phone?.trim()) {
    inputError('Student name, parent/guardian name and parent/guardian phone are required');
  }
  if (input.gender && !['male', 'female', 'other'].includes(input.gender)) inputError('Invalid gender');
  if (input.date_of_birth && (!/^\d{4}-\d{2}-\d{2}$/.test(input.date_of_birth) || !Number.isFinite(Date.parse(input.date_of_birth)))) inputError('Invalid date of birth');
  const id = generateId();
  const number = `APP-${generateId()}`;
  db.prepare(`INSERT INTO admission_applications (
    id, institution_id, branch_id, application_number, enquiry_id, first_name, middle_name, last_name,
    date_of_birth, gender, nationality, phone, email, address, desired_class_id, desired_section_id,
    desired_session_id, previous_school, previous_class, medical_conditions, status, submitted_at, created_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', datetime('now'), ?)`).run(
    id, req.institution_id, branchId, number, enquiryId, input.first_name.trim(), input.middle_name || null,
    input.last_name.trim(), input.date_of_birth || null, input.gender || null, input.nationality || 'Liberian',
    input.phone || null, input.email || null, input.address || null, input.class_id || null, input.section_id || null,
    input.session_id || null, input.previous_school || null, input.previous_class || null, input.medical_conditions || null, req.user?.id || null);
  db.prepare(`INSERT INTO application_parents (id, institution_id, application_id, relationship, is_primary,
    first_name, last_name, phone, email, address, occupation) VALUES (?, ?, ?, 'guardian', 1, ?, ?, ?, ?, ?, ?)`).run(
    generateId(), req.institution_id, id, parent.first_name.trim(), String(parent.last_name || '').trim(), parent.phone.trim(),
    parent.email || null, parent.address || null, parent.occupation || null);
  return { id, application_number: number };
}

function admissionFailure(res: Response, error: any) {
  res.status(error.status || 500).json({ error: error.status ? error.message : 'Admission operation failed; no changes were committed' });
}

function auditAdmission(db: any, req: AuthRequest, id: string, action: string, values: any) {
  db.prepare(`INSERT INTO audit_logs (id, institution_id, user_id, action, entity_type, entity_id, module, new_values)
    VALUES (?, ?, ?, ?, 'admission_application', ?, 'admissions', ?)`).run(
    generateId(), req.institution_id, req.user?.id || null, action, id, JSON.stringify(values));
}

// ============================================
// ADMISSION ENQUIRIES
// ============================================

// Dashboard stats
admissionRouter.get('/dashboard/stats', (req: AuthRequest, res: Response) => {
  const db = getDatabase();

  const stats = {
    pending_enquiries: db.prepare(`SELECT COUNT(*) as count FROM admission_enquiries WHERE institution_id = ? AND status = 'new'`).get(req.institution_id) as any,
    converted_enquiries: db.prepare(`SELECT COUNT(*) as count FROM admission_enquiries WHERE institution_id = ? AND converted_to_application_id IS NOT NULL`).get(req.institution_id) as any,
    pending_applications: db.prepare(`SELECT COUNT(*) as count FROM admission_applications WHERE institution_id = ? AND status IN ('draft', 'submitted') AND converted_to_student_id IS NULL`).get(req.institution_id) as any,
    review_applications: db.prepare(`SELECT COUNT(*) as count FROM admission_applications WHERE institution_id = ? AND status = 'under_review'`).get(req.institution_id) as any,
    approved_applications: db.prepare(`SELECT COUNT(*) as count FROM admission_applications WHERE institution_id = ? AND status = 'approved' AND converted_to_student_id IS NULL`).get(req.institution_id) as any,
    rejected_applications: db.prepare(`SELECT COUNT(*) as count FROM admission_applications WHERE institution_id = ? AND status = 'rejected'`).get(req.institution_id) as any,
    admitted_applications: db.prepare(`SELECT COUNT(*) as count FROM admission_applications WHERE institution_id = ? AND converted_to_student_id IS NOT NULL`).get(req.institution_id) as any
  };

  res.json({
    pending_enquiries: stats.pending_enquiries.count,
    converted_enquiries: stats.converted_enquiries.count,
    pending_applications: stats.pending_applications.count,
    review_applications: stats.review_applications.count,
    approved_applications: stats.approved_applications.count,
    rejected_applications: stats.rejected_applications.count,
    admitted_applications: stats.admitted_applications.count
  });
});

// List all enquiries
admissionRouter.get('/enquiries', (req: AuthRequest, res: Response) => {
  const db = getDatabase();
  const { page = '1', limit = '20', search = '', status = '' } = req.query as any;
  const { limit: lim, offset } = paginate(parseInt(page), parseInt(limit));

  let where = `WHERE e.institution_id = ?`;
  const params: any[] = [req.institution_id];

  if (search) {
    where += ` AND (e.student_first_name LIKE ? OR e.student_last_name LIKE ? OR e.parent_phone LIKE ? OR e.enquiry_number LIKE ?)`;
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  if (status) {
    where += ' AND e.status = ?';
    params.push(status);
  }

  const total = db.prepare(`SELECT COUNT(*) as count FROM admission_enquiries e ${where}`).get(...params) as any;

  const enquiries = db.prepare(`
    SELECT
      e.*,
      b.branch_name,
      c.name as class_name,
      u.first_name || ' ' || u.last_name as assigned_to_name
    FROM admission_enquiries e
    LEFT JOIN branches b ON e.branch_id = b.id
    LEFT JOIN classes c ON e.desired_class_id = c.id
    LEFT JOIN users u ON e.assigned_to = u.id
    ${where}
    ORDER BY e.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, lim, offset);

  res.json({ data: enquiries, total: total.count, page: parseInt(page), limit: lim });
});

// Get single enquiry
admissionRouter.get('/enquiries/:id', (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const db = getDatabase();

  const enquiry = db.prepare(`
    SELECT
      e.*,
      b.branch_name,
      c.name as class_name,
      u.first_name || ' ' || u.last_name as assigned_to_name
    FROM admission_enquiries e
    LEFT JOIN branches b ON e.branch_id = b.id
    LEFT JOIN classes c ON e.desired_class_id = c.id
    LEFT JOIN users u ON e.assigned_to = u.id
    WHERE e.id = ? AND e.institution_id = ?
  `).get(id, req.institution_id) as any;

  if (!enquiry) {
    res.status(404).json({ error: 'Enquiry not found' });
    return;
  }

  res.json(enquiry);
});

// Create new enquiry
admissionRouter.post('/enquiries', (req: AuthRequest, res: Response) => {
  const {
    student_first_name,
    student_last_name,
    student_middle_name,
    student_dob,
    student_gender,
    parent_name,
    parent_phone,
    parent_email,
    parent_address,
    parent_occupation,
    desired_class_id,
    previous_school,
    previous_class,
    enquiry_source,
    notes,
    assigned_to
  } = req.body;

  if (!student_first_name || !student_last_name || !parent_name || !parent_phone) {
    res.status(400).json({
      error: 'Required fields missing',
      required: ['student_first_name', 'student_last_name', 'parent_name', 'parent_phone']
    });
    return;
  }

  const db = getDatabase();
  const id = generateId();
  const enquiryNumber = `ENQ-${Date.now()}`;

  db.prepare(`
    INSERT INTO admission_enquiries (
      id, institution_id, branch_id, enquiry_number, enquiry_date, enquiry_source,
      student_first_name, student_middle_name, student_last_name, student_dob, student_gender,
      desired_class_id, previous_school, previous_class,
      parent_name, parent_phone, parent_email, parent_address, parent_occupation,
      status, notes, assigned_to, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)
  `).run(
    id, req.institution_id, req.user?.branch_id || null, enquiryNumber,
    new Date().toISOString().split('T')[0], enquiry_source || 'walk_in',
    student_first_name, student_middle_name || null, student_last_name,
    student_dob || null, student_gender ? student_gender.toLowerCase() : null,
    desired_class_id || null, previous_school || null, previous_class || null,
    parent_name, parent_phone, parent_email || null, parent_address || null,
    parent_occupation || null, notes || null, assigned_to || null, req.user?.id
  );

  res.status(201).json({ id, enquiry_number: enquiryNumber, message: 'Enquiry created successfully' });
});

// Update enquiry
admissionRouter.put('/enquiries/:id', authorize('platform_admin', 'institution_admin', 'principal', 'receptionist'), (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const {
    student_first_name,
    student_last_name,
    student_middle_name,
    student_dob,
    student_gender,
    parent_name,
    parent_phone,
    parent_email,
    parent_address,
    parent_occupation,
    desired_class_id,
    previous_school,
    previous_class,
    enquiry_source,
    status,
    notes,
    assigned_to,
    next_follow_up_date
  } = req.body;

  const db = getDatabase();

  db.prepare(`
    UPDATE admission_enquiries
    SET student_first_name = ?, student_middle_name = ?, student_last_name = ?,
        student_dob = ?, student_gender = ?, parent_name = ?, parent_phone = ?,
        parent_email = ?, parent_address = ?, parent_occupation = ?,
        desired_class_id = ?, previous_school = ?, previous_class = ?,
        enquiry_source = ?, status = ?, notes = ?, assigned_to = ?,
        next_follow_up_date = ?, updated_at = datetime('now')
    WHERE id = ? AND institution_id = ?
  `).run(
    student_first_name, student_middle_name || null, student_last_name,
    student_dob || null, student_gender ? student_gender.toLowerCase() : null,
    parent_name, parent_phone, parent_email || null, parent_address || null,
    parent_occupation || null, desired_class_id || null, previous_school || null,
    previous_class || null, enquiry_source, status, notes || null, assigned_to || null,
    next_follow_up_date || null, id, req.institution_id
  );

  res.json({ message: 'Enquiry updated successfully' });
});

// Delete enquiry
admissionRouter.delete('/enquiries/:id', authorize('platform_admin', 'institution_admin'), (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const db = getDatabase();

  db.prepare('DELETE FROM admission_enquiries WHERE id = ? AND institution_id = ?').run(id, req.institution_id);
  res.json({ message: 'Enquiry deleted successfully' });
});

// Convert enquiry to application
admissionRouter.post('/enquiries/:id/convert', authorize('platform_admin', 'institution_admin', 'principal', 'registrar'), (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const db = getDatabase();

  // Get enquiry details
  const enquiry = db.prepare('SELECT * FROM admission_enquiries WHERE id = ? AND institution_id = ?').get(id, req.institution_id) as any;

  if (!enquiry) {
    res.status(404).json({ error: 'Enquiry not found' });
    return;
  }

  if (enquiry.converted_to_application_id) {
    res.status(400).json({ error: 'Enquiry already converted to application' });
    return;
  }

  try {
    const result = db.transaction(() => {
      checkBranch(req, enquiry);
      // Conditional update serializes concurrent conversions on PostgreSQL too.
      const claimed = db.prepare(`UPDATE admission_enquiries SET updated_at = datetime('now')
        WHERE id = ? AND institution_id = ? AND converted_to_application_id IS NULL`).run(id, req.institution_id);
      if (!claimed.changes) inputError('Enquiry already converted to application', 409);
      const application = saveApplication(db, req, {
        ...enquiry, first_name: enquiry.student_first_name, middle_name: enquiry.student_middle_name,
        last_name: enquiry.student_last_name, date_of_birth: enquiry.student_dob,
        gender: enquiry.student_gender, class_id: enquiry.desired_class_id, session_id: enquiry.desired_session_id,
      }, id);
      db.prepare(`UPDATE admission_enquiries SET status = 'converted', converted_to_application_id = ?, converted_at = datetime('now')
        WHERE id = ? AND institution_id = ?`).run(application.id, id, req.institution_id);
      return application;
    })();
    res.status(201).json({ application_id: result.id, application_number: result.application_number });
  } catch (error) { admissionFailure(res, error); }
});

// ============================================
// ADMISSION APPLICATIONS
// ============================================

// List all applications
admissionRouter.get('/applications', (req: AuthRequest, res: Response) => {
  const db = getDatabase();
  const { page = '1', limit = '20', search = '', status = '' } = req.query as any;
  const { limit: lim, offset } = paginate(parseInt(page), parseInt(limit));

  let where = `WHERE a.institution_id = ?`;
  const params: any[] = [req.institution_id];
  if (req.user?.branch_id) { where += ' AND a.branch_id = ?'; params.push(req.user.branch_id); }

  if (search) {
    where += ` AND (a.first_name LIKE ? OR a.last_name LIKE ? OR a.phone LIKE ? OR a.application_number LIKE ?)`;
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  if (status) {
    if (status === 'admitted') where += ' AND a.converted_to_student_id IS NOT NULL';
    else {
      where += ' AND a.converted_to_student_id IS NULL';
      if (status === 'pending') where += " AND a.status IN ('draft', 'submitted')";
      else { where += ' AND a.status = ?'; params.push(status); }
    }
  }

  const total = db.prepare(`SELECT COUNT(*) as count FROM admission_applications a ${where}`).get(...params) as any;

  const applications = db.prepare(`
    SELECT
      a.*,
      b.branch_name,
      c.name as class_name
    FROM admission_applications a
    LEFT JOIN branches b ON a.branch_id = b.id
    LEFT JOIN classes c ON a.desired_class_id = c.id
    ${where}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, lim, offset);

  res.json({ data: applications.map(presentApplication), total: total.count, page: parseInt(page), limit: lim });
});

// Get single application
admissionRouter.get('/applications/:id', (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const db = getDatabase();

  const application = db.prepare(`
    SELECT
      a.*,
      b.branch_name,
      c.name as class_name,
      s.name as session_name
    FROM admission_applications a
    LEFT JOIN branches b ON a.branch_id = b.id
    LEFT JOIN classes c ON a.desired_class_id = c.id
    LEFT JOIN academic_sessions s ON a.desired_session_id = s.id
    WHERE a.id = ? AND a.institution_id = ?
  `).get(id, req.institution_id) as any;

  if (!application) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }

  if (req.user?.branch_id && application.branch_id !== req.user.branch_id) {
    res.status(404).json({ error: 'Application not found in your assigned branch' }); return;
  }
  const parent = db.prepare(`SELECT first_name, last_name, phone, email, address, occupation, relationship
    FROM application_parents WHERE application_id = ? AND institution_id = ? ORDER BY is_primary DESC, id LIMIT 1`).get(id, req.institution_id);
  res.json({ ...presentApplication(application), parent });
});

// Create new application
admissionRouter.post('/applications', authorize('platform_admin', 'institution_admin', 'principal', 'registrar'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const result = db.transaction(() => saveApplication(db, req, req.body))();
    res.status(201).json(result);
  } catch (error) { admissionFailure(res, error); }
});

// Update application status
admissionRouter.put('/applications/:id/status', authorize('platform_admin', 'institution_admin', 'principal'), (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, remarks } = req.body;

  if (!status || !['pending', 'under_review', 'approved', 'rejected'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const db = getDatabase();

  try {
    db.transaction(() => {
      const locked = db.prepare(`UPDATE admission_applications SET updated_at = updated_at
        WHERE id = ? AND institution_id = ?`).run(id, req.institution_id);
      if (!locked.changes) inputError('Application not found', 404);
      const application = db.prepare('SELECT * FROM admission_applications WHERE id = ? AND institution_id = ?').get(id, req.institution_id);
      checkBranch(req, application);
      if (application.converted_to_student_id) inputError('An enrolled application cannot change status', 409);
      const nextStatus = status === 'pending' ? 'submitted' : status;
      const transitions: Record<string, string[]> = {
        draft: ['submitted', 'under_review'], submitted: ['under_review', 'rejected'],
        under_review: ['approved', 'rejected', 'submitted'], rejected: ['under_review'], approved: ['under_review', 'rejected'],
      };
      if (nextStatus !== application.status && !transitions[application.status]?.includes(nextStatus)) inputError('Invalid application status transition', 409);
      db.prepare(`UPDATE admission_applications SET status = ?, review_notes = ?, reviewed_by = ?, reviewed_at = datetime('now'),
        approved_by = ?, approved_at = ?, rejected_by = ?, rejected_at = ?, rejection_reason = ?, updated_at = datetime('now')
        WHERE id = ? AND institution_id = ?`).run(nextStatus, remarks || null, req.user?.id || null,
        nextStatus === 'approved' ? req.user?.id : null, nextStatus === 'approved' ? new Date().toISOString() : null,
        nextStatus === 'rejected' ? req.user?.id : null, nextStatus === 'rejected' ? new Date().toISOString() : null,
        nextStatus === 'rejected' ? remarks || null : null, id, req.institution_id);
      auditAdmission(db, req, id, 'application_status_changed', { from: application.status, to: nextStatus });
    })();
    res.json({ message: 'Application status updated successfully' });
  } catch (error) { admissionFailure(res, error); }
});

admissionRouter.post('/applications/:id/enroll', requirePermission('students.create'), (req: AuthRequest, res: Response) => {
  const db = getDatabase();
  try {
    const result = db.transaction(() => {
      const locked = db.prepare(`UPDATE admission_applications SET updated_at = updated_at
        WHERE id = ? AND institution_id = ?`).run(req.params.id, req.institution_id);
      if (!locked.changes) inputError('Application not found', 404);
      const application = db.prepare('SELECT * FROM admission_applications WHERE id = ? AND institution_id = ?').get(req.params.id, req.institution_id);
      checkBranch(req, application);
      if (application.converted_to_student_id) {
        return { id: application.converted_to_student_id, already_enrolled: true, message: 'Application already enrolled; no new records created' };
      }
      if (application.status !== 'approved') inputError('Approve this application before enrolling the student', 409);
      const placement = {
        class_id: req.body.class_id || application.desired_class_id,
        section_id: req.body.section_id === undefined ? application.desired_section_id : req.body.section_id || null,
        session_id: req.body.session_id || application.desired_session_id,
        branch_id: application.branch_id || req.user?.branch_id || null,
      };
      if (!placement.class_id || !placement.session_id) inputError('Select a class and academic session before enrollment');
      validatePlacement(db, req.institution_id!, placement);
      const parent = db.prepare(`SELECT * FROM application_parents WHERE application_id = ? AND institution_id = ?
        ORDER BY is_primary DESC, id LIMIT 1`).get(application.id, req.institution_id);
      if (!parent?.first_name || !parent.phone) inputError('Application needs a parent/guardian name and phone before enrollment');
      const studentId = generateId();
      db.prepare(`UPDATE admission_applications SET converted_to_student_id = ?, converted_at = datetime('now'),
        desired_class_id = ?, desired_section_id = ?, desired_session_id = ?, updated_at = datetime('now')
        WHERE id = ? AND institution_id = ?`).run(studentId, placement.class_id, placement.section_id || null, placement.session_id, application.id, req.institution_id);
      const enrollment = createStudentEnrollment({ ...application, ...placement, parent, medical_info: application.medical_conditions }, {
        institutionId: req.institution_id!, createdBy: req.user?.id, branchId: req.user?.branch_id, studentId,
      });
      auditAdmission(db, req, application.id, 'application_enrolled', { student_id: studentId, ...placement, fees_assigned: enrollment.fees_assigned });
      return enrollment;
    })();
    // Credentials are returned once, never retained in the application or replayed.
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(result.already_enrolled ? 200 : 201).json(result);
  } catch (error) { admissionFailure(res, error); }
});

export default admissionRouter;
