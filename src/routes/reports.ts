import { Router, Response } from 'express';
import { getDatabase } from '../database/init';
import { AuthRequest, authorize } from '../middleware/auth';
import { injectTenant, requireTenant } from '../middleware/tenant';
import { generateId } from '../utils/helpers';

export const reportsRouter = Router();

reportsRouter.use(injectTenant);
reportsRouter.use(requireTenant);

function safeGet(fn: () => any, fallback: any = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

// Dashboard Statistics
reportsRouter.get('/stats', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const iid = req.institution_id;

    if (!iid) {
      res.status(400).json({ error: 'Institution context required' });
      return;
    }

    const students = safeGet(
      () =>
        db
          .prepare(
            `SELECT COUNT(*) as total,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) as active
             FROM students WHERE institution_id = ?`
          )
          .get(iid),
      { total: 0, active: 0 }
    );

    const teachers = safeGet(
      () =>
        db
          .prepare(
            `SELECT COUNT(*) as total,
                    COUNT(CASE WHEN is_active = 1 THEN 1 END) as active
             FROM employees
             WHERE institution_id = ? AND is_teacher = 1`
          )
          .get(iid),
      { total: 0, active: 0 }
    );

    const income = Number(
      safeGet(
        () =>
          (db
            .prepare(
              `SELECT COALESCE(SUM(amount), 0) as v FROM income
               WHERE institution_id = ? AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now')`
            )
            .get(iid) as any)?.v,
        0
      )
    );
    const feeIncome = Number(
      safeGet(
        () =>
          (db
            .prepare(
              `SELECT COALESCE(SUM(amount), 0) as v FROM payments
               WHERE institution_id = ? AND (status = 'completed' OR status IS NULL)
                 AND strftime('%Y-%m', payment_date) = strftime('%Y-%m', 'now')`
            )
            .get(iid) as any)?.v,
        0
      )
    );
    const expense = Number(
      safeGet(
        () =>
          (db
            .prepare(
              `SELECT COALESCE(SUM(amount), 0) as v FROM expenses
               WHERE institution_id = ? AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now')`
            )
            .get(iid) as any)?.v,
        0
      )
    );
    const finance = {
      income: income + feeIncome,
      expense,
      balance: income + feeIncome - expense,
    };

    const fees = safeGet(
      () =>
        db
          .prepare(
            `SELECT
               COUNT(*) as total_invoices,
               COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid,
               COUNT(CASE WHEN status IN ('unpaid','partial','overdue') THEN 1 END) as unpaid,
               COALESCE(SUM(total_amount), 0) as total_amount,
               COALESCE(SUM(paid_amount), 0) as collected
             FROM invoices
             WHERE institution_id = ?
               AND (session_id IS NULL OR session_id IN (
                 SELECT id FROM academic_sessions WHERE is_current = 1 AND institution_id = ?
               ))`
          )
          .get(iid, iid),
      { total_invoices: 0, paid: 0, unpaid: 0, total_amount: 0, collected: 0 }
    );

    const attendance = safeGet(
      () =>
        db
          .prepare(
            `SELECT
               COUNT(*) as total,
               COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as present,
               COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) as absent
             FROM student_attendance sa
             JOIN attendance_sessions a ON sa.attendance_session_id = a.id
             WHERE sa.institution_id = ? AND a.date = date('now')`
          )
          .get(iid),
      { total: 0, present: 0, absent: 0 }
    );

    res.json({
      students,
      teachers,
      finance,
      fees,
      attendance: {
        ...attendance,
        percentage: attendance?.total
          ? ((attendance.present / attendance.total) * 100).toFixed(1)
          : 0,
      },
    });
  } catch (err: any) {
    console.error('reports/stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Student Reports
reportsRouter.get('/students', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const iid = req.institution_id;
    if (!iid) {
      res.status(400).json({ error: 'Institution context required' });
      return;
    }

    const { class_id, section_id, status } = req.query as any;
    let where = 'WHERE s.institution_id = ?';
    const params: any[] = [iid];
    if (class_id) {
      where += ' AND s.class_id = ?';
      params.push(class_id);
    }
    if (section_id) {
      where += ' AND s.section_id = ?';
      params.push(section_id);
    }
    if (status) {
      where += ' AND s.status = ?';
      params.push(status);
    }

    const students = db
      .prepare(
        `SELECT s.*, c.name as class_name, sec.name as section_name,
          (SELECT COUNT(*) FROM student_attendance sa
           WHERE sa.student_id = s.id AND sa.status = 'present') as present_days,
          (SELECT COUNT(*) FROM student_attendance sa
           WHERE sa.student_id = s.id) as total_days
         FROM students s
         LEFT JOIN classes c ON s.class_id = c.id
         LEFT JOIN sections sec ON s.section_id = sec.id
         ${where}
         ORDER BY c.sort_order, sec.name, s.first_name`
      )
      .all(...params);

    res.json(students);
  } catch (err: any) {
    console.error('reports/students error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Financial Reports
reportsRouter.get('/financial', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const iid = req.institution_id;
    if (!iid) {
      res.status(400).json({ error: 'Institution context required' });
      return;
    }

    const { start_date, end_date, type } = req.query as any;
    const params: any[] = [iid];
    let dateFilter = '';
    if (start_date) {
      dateFilter += ' AND date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      dateFilter += ' AND date <= ?';
      params.push(end_date);
    }

    const incomeRows =
      !type || type === 'income'
        ? db
            .prepare(
              `SELECT i.id, i.amount, i.date, i.description, i.payment_method,
                      'income' as type, ic.name as category_name
               FROM income i
               LEFT JOIN income_categories ic ON i.category_id = ic.id
               WHERE i.institution_id = ? ${dateFilter}
               ORDER BY i.date DESC`
            )
            .all(...params)
        : [];

    const expenseParams = [...params];
    const expenseRows =
      !type || type === 'expense'
        ? db
            .prepare(
              `SELECT e.id, e.amount, e.date, e.description, e.payment_method,
                      'expense' as type, ec.name as category_name
               FROM expenses e
               LEFT JOIN expense_categories ec ON e.category_id = ec.id
               WHERE e.institution_id = ? ${dateFilter}
               ORDER BY e.date DESC`
            )
            .all(...expenseParams)
        : [];

    const transactions = [...(incomeRows as any[]), ...(expenseRows as any[])].sort((a, b) =>
      String(b.date).localeCompare(String(a.date))
    );

    const summary = [
      {
        type: 'income',
        count: (incomeRows as any[]).length,
        total: (incomeRows as any[]).reduce((s, r) => s + Number(r.amount || 0), 0),
      },
      {
        type: 'expense',
        count: (expenseRows as any[]).length,
        total: (expenseRows as any[]).reduce((s, r) => s + Number(r.amount || 0), 0),
      },
    ];

    res.json({ transactions, summary });
  } catch (err: any) {
    console.error('reports/financial error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Attendance Reports
reportsRouter.get('/attendance', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const iid = req.institution_id;
    if (!iid) {
      res.status(400).json({ error: 'Institution context required' });
      return;
    }

    const { start_date, end_date, class_id } = req.query as any;
    const params: any[] = [iid];
    let sessionFilter = '';
    if (start_date) {
      sessionFilter += ' AND a.date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      sessionFilter += ' AND a.date <= ?';
      params.push(end_date);
    }
    if (class_id) {
      sessionFilter += ' AND s.class_id = ?';
      params.push(class_id);
    }

    const report = db
      .prepare(
        `SELECT s.id, s.admission_number, s.first_name, s.last_name, c.name as class_name,
           COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as present,
           COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) as absent,
           COUNT(CASE WHEN sa.status = 'late' THEN 1 END) as late,
           COUNT(sa.id) as total_days
         FROM students s
         LEFT JOIN classes c ON s.class_id = c.id
         LEFT JOIN student_attendance sa ON sa.student_id = s.id
         LEFT JOIN attendance_sessions a ON sa.attendance_session_id = a.id
         WHERE s.institution_id = ? AND s.status = 'active' ${sessionFilter}
         GROUP BY s.id, s.admission_number, s.first_name, s.last_name, c.name, c.sort_order
         ORDER BY c.sort_order, s.first_name`
      )
      .all(...params);

    res.json(report);
  } catch (err: any) {
    console.error('reports/attendance error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Academic Performance Reports
reportsRouter.get('/academic', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const iid = req.institution_id;
    if (!iid) {
      res.status(400).json({ error: 'Institution context required' });
      return;
    }

    const { exam_id, class_id } = req.query as any;
    if (!exam_id) {
      res.status(400).json({ error: 'Exam ID required' });
      return;
    }

    let where = 'WHERE r.exam_id = ? AND s.institution_id = ?';
    const params: any[] = [exam_id, iid];
    if (class_id) {
      where += ' AND s.class_id = ?';
      params.push(class_id);
    }

    const results = db
      .prepare(
        `SELECT s.id, s.admission_number, s.first_name, s.last_name,
           c.name as class_name, sec.name as section_name,
           r.total_marks, r.total_obtained as marks_obtained, r.percentage, r.grade, r.rank
         FROM results r
         JOIN students s ON s.id = r.student_id
         LEFT JOIN classes c ON s.class_id = c.id
         LEFT JOIN sections sec ON s.section_id = sec.id
         ${where}
         ORDER BY r.rank, s.first_name`
      )
      .all(...params);

    res.json(results);
  } catch (err: any) {
    console.error('reports/academic error:', err);
    res.status(500).json({ error: err.message });
  }
});

reportsRouter.post('/custom', authorize('platform_admin'), (req: AuthRequest, res: Response) => {
  try {
    const { query, parameters } = req.body;
    if (!query) {
      res.status(400).json({ error: 'Query required' });
      return;
    }
    if (!query.trim().toUpperCase().startsWith('SELECT')) {
      res.status(400).json({ error: 'Only SELECT queries allowed' });
      return;
    }

    const db = getDatabase();
    const results = db.prepare(query).all(...(parameters || []));
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reportsRouter.post('/backup', authorize('platform_admin', 'institution_admin'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const iid = req.institution_id;
    if (!iid) {
      res.status(400).json({ error: 'Institution context required' });
      return;
    }

    const id = generateId();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `backups/backup_${timestamp}.db`;

    db.prepare(
      `INSERT INTO system_backups (id, institution_id, type, file_path, status, initiated_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, iid, 'database', backupPath, 'completed', req.user?.id || null);

    res.status(201).json({ id, file_path: backupPath, message: 'Backup created' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reportsRouter.get('/backups', authorize('platform_admin', 'institution_admin'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const backups = db
      .prepare(
        `SELECT * FROM system_backups
         WHERE institution_id = ? OR ? IS NULL
         ORDER BY created_at DESC LIMIT 50`
      )
      .all(req.institution_id, req.institution_id);
    res.json(backups);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reportsRouter.get('/bulk-operations', authorize('platform_admin', 'institution_admin'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const operations = safeGet(
      () =>
        db
          .prepare(
            `SELECT * FROM bulk_operations
             WHERE institution_id = ?
             ORDER BY started_at DESC LIMIT 50`
          )
          .all(req.institution_id),
      []
    );
    res.json(operations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reportsRouter.get('/health', authorize('platform_admin', 'institution_admin'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const iid = req.institution_id;

    const dbSize = safeGet(
      () => db.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').get(),
      { size: 0 }
    );

    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
      )
      .all();

    const recentActivity = {
      students_today: safeGet(
        () =>
          db
            .prepare(
              `SELECT COUNT(*) as count FROM students
               WHERE institution_id = ? AND date(created_at) = date('now')`
            )
            .get(iid),
        { count: 0 }
      ),
      attendance_today: safeGet(
        () =>
          db
            .prepare(
              `SELECT COUNT(*) as count FROM student_attendance sa
               JOIN attendance_sessions a ON sa.attendance_session_id = a.id
               WHERE sa.institution_id = ? AND a.date = date('now')`
            )
            .get(iid),
        { count: 0 }
      ),
      payments_today: safeGet(
        () =>
          db
            .prepare(
              `SELECT COUNT(*) as count FROM payments
               WHERE institution_id = ? AND date(payment_date) = date('now')`
            )
            .get(iid),
        { count: 0 }
      ),
    };

    res.json({
      database_size: (dbSize as any)?.size || 0,
      tables_count: tables.length,
      recent_activity: recentActivity,
      status: 'healthy',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
