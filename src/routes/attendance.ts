import { Router, Response } from 'express';
import { getDatabase } from '../database/init';
import { AuthRequest, requirePermission } from '../middleware/auth';
import { injectTenant, requireTenant } from '../middleware/tenant';
import { generateId } from '../utils/helpers';

export const attendanceRouter = Router();

// Apply tenant middleware to ALL routes
attendanceRouter.use(injectTenant);
attendanceRouter.use(requireTenant);

function attendanceInputError(req: AuthRequest, classId: string, sectionId: string | null, subjectId: string | null, records: any[]): string | null {
  const db = getDatabase();
  if (!db.prepare('SELECT id FROM classes WHERE id = ? AND institution_id = ?').get(classId, req.institution_id)) return 'Class does not belong to this school';
  if (sectionId && !db.prepare('SELECT id FROM sections WHERE id = ? AND class_id = ? AND institution_id = ?').get(sectionId, classId, req.institution_id)) return 'Section does not belong to this class';
  if (req.user?.user_type === 'teacher') {
    const allowed = db.prepare(`SELECT ta.id FROM teacher_assignments ta JOIN employees e ON e.id = ta.employee_id
      WHERE e.user_id = ? AND ta.institution_id = ? AND ta.class_id = ?
      AND (? IS NULL OR ta.subject_id = ?) AND (? IS NULL OR ta.section_id IS NULL OR ta.section_id = ?)`).get(req.user.id, req.institution_id, classId, subjectId, subjectId, sectionId, sectionId);
    if (!allowed) return 'You are not assigned to this class, subject and section';
  }
  const seen = new Set<string>();
  for (const row of records) {
    if (!row || seen.has(row.student_id) || !['present', 'absent', 'late', 'excused'].includes(row.status)) return 'Invalid or duplicate attendance record';
    seen.add(row.student_id);
    const student = db.prepare('SELECT id, section_id FROM students WHERE id = ? AND institution_id = ? AND class_id = ?').get(row.student_id, req.institution_id, classId) as any;
    if (!student || (sectionId && student.section_id !== sectionId)) return 'Every student must belong to the selected school, class and section';
  }
  return null;
}

attendanceRouter.get('/sessions', (req: AuthRequest, res: Response) => {
  const db = getDatabase();
  const { class_id, section_id, date, term_id } = req.query as any;

  // TENANT ISOLATION: Always filter by institution_id
  const institutionFilter = req.institution_id ? `a.institution_id = '${req.institution_id}'` : '1=1';
  let where = `WHERE ${institutionFilter}`;
  const params: any[] = [];

  if (class_id) { where += ' AND a.class_id = ?'; params.push(class_id); }
  if (section_id) { where += ' AND a.section_id = ?'; params.push(section_id); }
  if (date) { where += ' AND a.date = ?'; params.push(date); }
  if (term_id) { where += ' AND a.term_id = ?'; params.push(term_id); }

  const sessions = db.prepare(`
    SELECT a.*, c.name as class_name, sec.name as section_name,
           sub.name as subject_name, e.first_name || ' ' || e.last_name as teacher_name,
           (SELECT COUNT(*) FROM student_attendance sa WHERE sa.attendance_session_id = a.id AND sa.status = 'present') as present_count,
           (SELECT COUNT(*) FROM student_attendance sa WHERE sa.attendance_session_id = a.id AND sa.status = 'absent') as absent_count,
           (SELECT COUNT(*) FROM student_attendance sa WHERE sa.attendance_session_id = a.id AND sa.status = 'late') as late_count,
           (SELECT COUNT(*) FROM student_attendance sa WHERE sa.attendance_session_id = a.id) as total_count
    FROM attendance_sessions a
    LEFT JOIN classes c ON a.class_id = c.id
    LEFT JOIN sections sec ON a.section_id = sec.id
    LEFT JOIN subjects sub ON a.subject_id = sub.id
    LEFT JOIN employees e ON a.teacher_id = e.id
    ${where}
    ORDER BY a.date DESC, a.created_at DESC
    LIMIT 50
  `).all(...params);

  res.json(sessions);
});

attendanceRouter.get('/sessions/:id', (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const db = getDatabase();

  // TENANT ISOLATION: Filter by institution_id
  const institutionFilter = req.institution_id ? `AND a.institution_id = '${req.institution_id}'` : '';
  const session = db.prepare(`
    SELECT a.*, c.name as class_name, sec.name as section_name,
           sub.name as subject_name, e.first_name || ' ' || e.last_name as teacher_name
    FROM attendance_sessions a
    LEFT JOIN classes c ON a.class_id = c.id
    LEFT JOIN sections sec ON a.section_id = sec.id
    LEFT JOIN subjects sub ON a.subject_id = sub.id
    LEFT JOIN employees e ON a.teacher_id = e.id
    WHERE a.id = ? ${institutionFilter}
  `).get(id);

  if (!session) {
    res.status(404).json({ error: 'Attendance session not found' });
    return;
  }

  // TENANT ISOLATION: Filter related students
  const studentInstitutionFilter = req.institution_id ? `AND s.institution_id = '${req.institution_id}'` : '';
  const records = db.prepare(`
    SELECT sa.*, s.admission_number, s.first_name, s.last_name, s.photo
    FROM student_attendance sa
    JOIN students s ON sa.student_id = s.id
    WHERE sa.attendance_session_id = ? ${studentInstitutionFilter}
    ORDER BY s.first_name, s.last_name
  `).all(id);

  res.json({ ...(session as any), records });
});

attendanceRouter.post('/take', requirePermission('attendance.mark'), (req: AuthRequest, res: Response) => {
  try {
    const { class_id, section_id, subject_id, session_id, term_id, date, type, records } = req.body;

    if (!class_id || !date || !records || !Array.isArray(records)) {
      res.status(400).json({ error: 'Class, date, and attendance records are required' });
      return;
    }
    if (!req.institution_id) {
      res.status(400).json({ error: 'Select a school before recording attendance' });
      return;
    }

    const db = getDatabase();
    const invalid = attendanceInputError(req, class_id, section_id || null, subject_id || null, records);
    if (invalid) { res.status(400).json({ error: invalid }); return; }
    if (session_id && !db.prepare('SELECT id FROM academic_sessions WHERE id = ? AND institution_id = ?').get(session_id, req.institution_id)) {
      res.status(400).json({ error: 'Invalid academic session for this school' }); return;
    }
    const attendanceSessionId = generateId();
    const teacher = db.prepare(`
      SELECT id FROM employees
      WHERE institution_id = ?
        AND (user_id = ? OR id = (
          SELECT linked_entity_id FROM users WHERE id = ? AND linked_entity_type = 'employee'
        ))
      LIMIT 1
    `).get(req.institution_id, req.user?.id || '', req.user?.id || '') as { id: string } | undefined;

    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO attendance_sessions (id, institution_id, class_id, section_id, subject_id, session_id, term_id, teacher_id, date, type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        attendanceSessionId,
        req.institution_id,
        class_id,
        section_id || null,
        subject_id || null,
        session_id || null,
        term_id || null,
        teacher?.id || null,
        date,
        type || 'class'
      );

      const insertRecord = db.prepare(`
        INSERT INTO student_attendance (id, institution_id, attendance_session_id, student_id, status, remarks)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const record of records) {
        if (!record?.student_id || !record?.status) continue;
        insertRecord.run(
          generateId(),
          req.institution_id,
          attendanceSessionId,
          record.student_id,
          record.status,
          record.remarks || null
        );
      }
    });

    transaction();
    res.status(201).json({ id: attendanceSessionId, message: 'Attendance recorded successfully' });
  } catch (err: any) {
    console.error('Attendance take failed:', err);
    res.status(400).json({ error: err.message || 'Could not save attendance' });
  }
});

attendanceRouter.put('/sessions/:id', requirePermission('attendance.edit', 'attendance.mark'), (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { records } = req.body;

    if (!records || !Array.isArray(records)) {
      res.status(400).json({ error: 'Attendance records are required' });
      return;
    }

    const db = getDatabase();
    const institutionFilter = req.institution_id ? `AND institution_id = '${req.institution_id}'` : '';
    const session = db.prepare(`SELECT * FROM attendance_sessions WHERE id = ? ${institutionFilter}`).get(id) as any;
    if (!session) {
      res.status(404).json({ error: 'Attendance session not found' });
      return;
    }
    const invalid = attendanceInputError(req, session.class_id, session.section_id, session.subject_id, records);
    if (invalid) { res.status(400).json({ error: invalid }); return; }

    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM student_attendance WHERE attendance_session_id = ?').run(id);

      const insertRecord = db.prepare(`
        INSERT INTO student_attendance (id, institution_id, attendance_session_id, student_id, status, remarks)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const record of records) {
        if (!record?.student_id || !record?.status) continue;
        insertRecord.run(
          generateId(),
          req.institution_id,
          id,
          record.student_id,
          record.status,
          record.remarks || null
        );
      }
    });

    transaction();
    res.json({ message: 'Attendance updated successfully' });
  } catch (err: any) {
    console.error('Attendance update failed:', err);
    res.status(400).json({ error: err.message || 'Could not update attendance' });
  }
});

attendanceRouter.get('/student/:studentId', (req: AuthRequest, res: Response) => {
  const { studentId } = req.params;
  const { term_id, session_id, month } = req.query as any;

  const db = getDatabase();
  // TENANT ISOLATION: Filter by institution_id
  const institutionFilter = req.institution_id ? `AND a.institution_id = '${req.institution_id}'` : '';
  let where = `WHERE sa.student_id = ? ${institutionFilter}`;
  const params: any[] = [studentId];

  if (term_id) { where += ' AND a.term_id = ?'; params.push(term_id); }
  if (session_id) { where += ' AND a.session_id = ?'; params.push(session_id); }
  if (month) { where += " AND strftime('%Y-%m', a.date) = ?"; params.push(month); }

  const records = db.prepare(`
    SELECT sa.status, sa.remarks, a.date, a.type, sub.name as subject_name
    FROM student_attendance sa
    JOIN attendance_sessions a ON sa.attendance_session_id = a.id
    LEFT JOIN subjects sub ON a.subject_id = sub.id
    ${where}
    ORDER BY a.date DESC
  `).all(...params);

  const summary = db.prepare(`
    SELECT sa.status, COUNT(*) as count
    FROM student_attendance sa
    JOIN attendance_sessions a ON sa.attendance_session_id = a.id
    ${where}
    GROUP BY sa.status
  `).all(...params);

  res.json({ records, summary });
});

attendanceRouter.get('/report', (req: AuthRequest, res: Response) => {
  const { class_id, section_id, term_id, session_id, start_date, end_date } = req.query as any;

  if (!class_id) {
    res.status(400).json({ error: 'Class is required' });
    return;
  }

  const db = getDatabase();
  // TENANT ISOLATION: Filter by institution_id
  let dateFilter = req.institution_id ? ` AND a.institution_id = '${req.institution_id}'` : '';
  const params: any[] = [class_id];

  if (section_id) { dateFilter += ' AND a.section_id = ?'; params.push(section_id); }
  if (term_id) { dateFilter += ' AND a.term_id = ?'; params.push(term_id); }
  if (session_id) { dateFilter += ' AND a.session_id = ?'; params.push(session_id); }
  if (start_date) { dateFilter += ' AND a.date >= ?'; params.push(start_date); }
  if (end_date) { dateFilter += ' AND a.date <= ?'; params.push(end_date); }

  const report = db.prepare(`
    SELECT s.id, s.admission_number, s.first_name, s.last_name,
      COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as present_days,
      COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) as absent_days,
      COUNT(CASE WHEN sa.status = 'late' THEN 1 END) as late_days,
      COUNT(CASE WHEN sa.status = 'excused' THEN 1 END) as excused_days,
      COUNT(sa.id) as total_days,
      ROUND(
        CASE WHEN COUNT(sa.id) = 0 THEN 0
        ELSE COUNT(CASE WHEN sa.status = 'present' THEN 1 END) * 100.0 / COUNT(sa.id)
        END
      , 1) as attendance_percentage
    FROM students s
    LEFT JOIN student_attendance sa ON sa.student_id = s.id
    LEFT JOIN attendance_sessions a ON sa.attendance_session_id = a.id AND a.class_id = ? ${dateFilter}
    WHERE s.class_id = ? ${req.institution_id ? `AND s.institution_id = '${req.institution_id}'` : ''} AND s.status = 'active'
    GROUP BY s.id
    ORDER BY s.first_name, s.last_name
  `).all(...params, class_id);

  res.json(report);
});
