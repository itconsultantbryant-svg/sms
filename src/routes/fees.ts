import { Router, Response } from 'express';
import { getDatabase } from '../database/init';
import { AuthRequest, authorize } from '../middleware/auth';
import { injectTenant, requireTenant } from '../middleware/tenant';
import { generateId, paginate } from '../utils/helpers';
import { assignClassFees } from '../utils/assignClassFees';

function normalizePaymentMethod(method?: string): string {
  const key = String(method || 'cash').toLowerCase().replace(/\s+/g, '_');
  const map: Record<string, string> = {
    cash: 'cash',
    bank: 'bank',
    bank_transfer: 'bank',
    transfer: 'bank',
    mobile_money: 'mobile_money',
    momo: 'mobile_money',
    card: 'card',
    check: 'cheque',
    cheque: 'cheque',
    other: 'other',
  };
  return map[key] || 'cash';
}

function canAccessStudentFees(req: AuthRequest, studentId: string): boolean {
  if (req.user?.user_type === 'platform_admin' || req.user?.user_type === 'institution_admin') return true;
  const db = getDatabase();
  if (req.user?.user_type === 'student') {
    const own = db.prepare(`
      SELECT id FROM students
      WHERE id = ? AND (
        user_id = ?
        OR admission_number = (SELECT username FROM users WHERE id = ?)
      )
    `).get(studentId, req.user.id, req.user.id);
    return !!own;
  }
  if (req.user?.user_type === 'parent') {
    const link = db.prepare(`
      SELECT id FROM parent_students WHERE parent_id = ? AND student_id = ?
    `).get(req.user.id, studentId);
    return !!link;
  }
  return false;
}

export const feesRouter = Router();

// Apply tenant middleware to ALL fee routes
feesRouter.use(injectTenant);
feesRouter.use(requireTenant);

// Fee Types
feesRouter.get('/types', (req: AuthRequest, res: Response) => {
  const db = getDatabase();
  const types = db.prepare('SELECT * FROM fee_types WHERE institution_id = ? AND (is_active = 1 OR is_active IS NULL) ORDER BY name').all(req.institution_id);
  res.json(types);
});

feesRouter.post('/types', authorize('platform_admin', 'institution_admin', 'accountant', 'finance_officer', 'finance'), (req: AuthRequest, res: Response) => {
  const { name, code, description, is_recurring } = req.body;
  if (!name) { res.status(400).json({ error: 'Name is required' }); return; }
  const db = getDatabase();
  const id = generateId();
  db.prepare('INSERT INTO fee_types (id, institution_id, name, code, description, is_recurring) VALUES (?, ?, ?, ?, ?, ?)').run(id, req.institution_id, name, code || null, description || null, is_recurring ? 1 : 0);
  res.status(201).json({ id, message: 'Fee type created successfully' });
});

feesRouter.put('/types/:id', authorize('platform_admin', 'institution_admin', 'accountant', 'finance_officer', 'finance'), (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, code, description, is_recurring, is_active } = req.body;
  const db = getDatabase();
  db.prepare(`UPDATE fee_types SET name = COALESCE(?, name), code = COALESCE(?, code), description = COALESCE(?, description), is_recurring = COALESCE(?, is_recurring), is_active = COALESCE(?, is_active) WHERE id = ? AND institution_id = ?`).run(name, code, description, is_recurring, is_active, id, req.institution_id);
  res.json({ message: 'Fee type updated successfully' });
});

// Fee Structures
feesRouter.get('/structures', (req: AuthRequest, res: Response) => {
  const db = getDatabase();
  const { session_id, class_id, branch_id } = req.query as any;
  let where = 'WHERE fs.institution_id = ? AND fs.is_active = 1';
  const params: any[] = [req.institution_id];
  if (session_id) { where += ' AND fs.session_id = ?'; params.push(session_id); }
  if (class_id) { where += ' AND fs.class_id = ?'; params.push(class_id); }
  if (branch_id) { where += ' AND fs.branch_id = ?'; params.push(branch_id); }

  const structures = db.prepare(`
    SELECT fs.*, ft.name as fee_type_name, c.name as class_name, s.name as session_name, t.name as term_name, b.branch_name as branch_name
    FROM fee_structures fs
    LEFT JOIN fee_types ft ON fs.fee_type_id = ft.id
    LEFT JOIN classes c ON fs.class_id = c.id
    LEFT JOIN academic_sessions s ON fs.session_id = s.id
    LEFT JOIN terms t ON fs.term_id = t.id
    LEFT JOIN branches b ON fs.branch_id = b.id
    ${where}
    ORDER BY c.sort_order, ft.name
  `).all(...params);

  res.json(structures);
});

feesRouter.post('/structures', authorize('platform_admin', 'institution_admin', 'accountant', 'finance_officer', 'finance'), (req: AuthRequest, res: Response) => {
  const { fee_type_id, session_id, term_id, branch_id, class_id, amount, due_date, currency_code } = req.body;
  if (!fee_type_id || !session_id || !class_id || !amount) {
    res.status(400).json({ error: 'Fee type, session, class, and amount are required' });
    return;
  }
  const db = getDatabase();
  const id = generateId();
  const currency = String(currency_code || 'USD').toUpperCase() === 'LRD' ? 'LRD' : 'USD';
  db.prepare(`INSERT INTO fee_structures (id, institution_id, fee_type_id, session_id, term_id, branch_id, class_id, amount, due_date, currency_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, req.institution_id, fee_type_id, session_id, term_id || null, branch_id || null, class_id, amount, due_date || null, currency);
  const assigned = assignClassFees({
    institutionId: req.institution_id,
    createdBy: req.user?.id,
    structureId: id,
  });
  const message = assigned.students
    ? `Fee assigned to ${assigned.students} student${assigned.students === 1 ? '' : 's'} in this class`
    : 'Fee saved. No active students are enrolled in that class yet — they will be billed when they join the class';
  res.status(201).json({ id, ...assigned, message });
});

feesRouter.put('/structures/:id', authorize('platform_admin', 'institution_admin', 'accountant', 'finance_officer', 'finance'), (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { amount, due_date, is_active } = req.body;
  const db = getDatabase();
  db.prepare(`UPDATE fee_structures SET amount = COALESCE(?, amount), due_date = COALESCE(?, due_date), is_active = COALESCE(?, is_active), updated_at = datetime('now') WHERE id = ? AND institution_id = ?`).run(amount, due_date, is_active, id, req.institution_id);
  res.json({ message: 'Fee structure updated successfully' });
});

// Discounts
feesRouter.get('/discounts', (req: AuthRequest, res: Response) => {
  const db = getDatabase();
  const discounts = db.prepare('SELECT * FROM fee_discounts WHERE institution_id = ? AND is_active = 1 ORDER BY name').all(req.institution_id);
  res.json(discounts);
});

feesRouter.post('/discounts', authorize('platform_admin', 'institution_admin', 'accountant', 'finance_officer', 'finance'), (req: AuthRequest, res: Response) => {
  const { name, type, value, description } = req.body;
  if (!name || !value) { res.status(400).json({ error: 'Name and value are required' }); return; }
  const db = getDatabase();
  const id = generateId();
  db.prepare('INSERT INTO fee_discounts (id, institution_id, name, type, value, description) VALUES (?, ?, ?, ?, ?, ?)').run(id, req.institution_id, name, type || 'percentage', value, description || null);
  res.status(201).json({ id, message: 'Discount created successfully' });
});

// Invoices
feesRouter.get('/invoices', (req: AuthRequest, res: Response) => {
  const db = getDatabase();
  const { page = '1', limit = '20', student_id, status, session_id, class_id } = req.query as any;
  const { limit: lim, offset } = paginate(parseInt(page), parseInt(limit));
  if (req.institution_id) {
    try {
      assignClassFees({ institutionId: req.institution_id, createdBy: req.user?.id });
    } catch (err) {
      console.error('Fee assignment sync failed:', err);
    }
  }

  let where = 'WHERE i.institution_id = ?';
  const params: any[] = [req.institution_id];
  if (student_id) { where += ' AND i.student_id = ?'; params.push(student_id); }
  if (status === 'outstanding') {
    where += ` AND i.status IN ('unpaid', 'partial', 'overdue')`;
  } else if (status) {
    where += ' AND i.status = ?';
    params.push(status);
  }
  if (session_id) { where += ' AND i.session_id = ?'; params.push(session_id); }
  if (class_id) { where += ' AND s.class_id = ?'; params.push(class_id); }

  const total = db.prepare(`SELECT COUNT(*) as count FROM invoices i LEFT JOIN students s ON i.student_id = s.id ${where}`).get(...params) as any;

  const invoices = db.prepare(`
    SELECT i.*, s.first_name, s.last_name, s.admission_number, c.name as class_name, sec.name as section_name, ses.name as session_name, t.name as term_name
    FROM invoices i
    LEFT JOIN students s ON i.student_id = s.id
    LEFT JOIN classes c ON s.class_id = c.id
    LEFT JOIN sections sec ON s.section_id = sec.id
    LEFT JOIN academic_sessions ses ON i.session_id = ses.id
    LEFT JOIN terms t ON i.term_id = t.id
    ${where}
    ORDER BY i.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, lim, offset);

  res.json({ data: invoices, total: total.count, page: parseInt(page), limit: lim });
});

feesRouter.get('/invoices/:id', (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const db = getDatabase();

  const invoice = db.prepare(`
    SELECT i.*, s.first_name, s.last_name, s.admission_number, s.photo, c.name as class_name, sec.name as section_name
    FROM invoices i
    LEFT JOIN students s ON i.student_id = s.id
    LEFT JOIN classes c ON s.class_id = c.id
    LEFT JOIN sections sec ON s.section_id = sec.id
    WHERE i.id = ? AND i.institution_id = ?
  `).get(id, req.institution_id) as any;

  if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }

  const items = db.prepare(`
    SELECT ii.*, ft.name as fee_type_name FROM invoice_items ii
    LEFT JOIN fee_types ft ON ii.fee_type_id = ft.id
    WHERE ii.invoice_id = ?
  `).all(id);

  const payments = db.prepare(`
    SELECT * FROM payments WHERE invoice_id = ? AND status = 'completed' ORDER BY payment_date DESC
  `).all(id);

  const institution = db.prepare('SELECT * FROM institutions WHERE id = ?').get(req.institution_id);
  res.json({ ...invoice, items, payments, institution });
});

feesRouter.post('/invoices/generate', authorize('platform_admin', 'institution_admin', 'accountant', 'finance_officer', 'finance'), (req: AuthRequest, res: Response) => {
  try {
    const { student_id, class_id } = req.body;
    if (!req.institution_id) {
      res.status(400).json({ error: 'Select a school first' });
      return;
    }
    const assigned = assignClassFees({
      institutionId: req.institution_id,
      createdBy: req.user?.id,
      studentId: student_id || null,
      classId: class_id || null,
    });
    if (!assigned.items && !assigned.students) {
      res.status(400).json({ error: 'No unbilled class fees found for the enrolled students' });
      return;
    }
    res.status(201).json({ ...assigned, message: `Invoices updated for ${assigned.students} student${assigned.students === 1 ? '' : 's'}` });
  } catch (err: any) {
    console.error('Invoice generation error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Payments
feesRouter.get('/payments', (req: AuthRequest, res: Response) => {
  const db = getDatabase();
  const { page = '1', limit = '20', student_id, start_date, end_date, method } = req.query as any;
  const { limit: lim, offset } = paginate(parseInt(page), parseInt(limit));

  let where = "WHERE p.institution_id = ? AND p.status = 'completed'";
  const params: any[] = [req.institution_id];
  if (student_id) { where += ' AND p.student_id = ?'; params.push(student_id); }
  if (start_date) { where += ' AND p.payment_date >= ?'; params.push(start_date); }
  if (end_date) { where += ' AND p.payment_date <= ?'; params.push(end_date); }
  if (method) { where += ' AND p.payment_method = ?'; params.push(method); }

  const total = db.prepare(`SELECT COUNT(*) as count FROM payments p ${where}`).get(...params) as any;

  const payments = db.prepare(`
    SELECT p.*, s.first_name, s.last_name, s.admission_number, i.invoice_number
    FROM payments p
    LEFT JOIN students s ON p.student_id = s.id
    LEFT JOIN invoices i ON p.invoice_id = i.id
    ${where}
    ORDER BY p.payment_date DESC, p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, lim, offset);

  res.json({ data: payments, total: total.count, page: parseInt(page), limit: lim });
});

feesRouter.post('/payments', authorize('platform_admin', 'institution_admin', 'accountant', 'finance_officer', 'finance'), (req: AuthRequest, res: Response) => {
  const { invoice_id, amount, payment_method, payment_date, reference_number, notes, currency_code } = req.body;
  if (!invoice_id || !amount || !payment_date) {
    res.status(400).json({ error: 'Invoice, amount, and payment date are required' });
    return;
  }

  const db = getDatabase();
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? AND institution_id = ?').get(invoice_id, req.institution_id) as any;
  if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }

  const isStaff = ['platform_admin', 'institution_admin', 'accountant', 'staff'].includes(req.user?.user_type || '')
    || (req.user?.role_codes || []).some((c) => ['accountant', 'finance_officer', 'finance'].includes(c));
  if (!isStaff && !canAccessStudentFees(req, invoice.student_id)) {
    res.status(403).json({ error: 'You can only pay invoices for your own student record' });
    return;
  }

  const payAmount = Number(amount);
  if (!payAmount || payAmount <= 0) {
    res.status(400).json({ error: 'Amount must be greater than zero' });
    return;
  }
  if (payAmount > Number(invoice.balance || 0) + 0.001) {
    res.status(400).json({ error: 'Payment amount exceeds balance' });
    return;
  }

  const paymentId = generateId();
  const paymentNumber = `PAY-${Date.now().toString(36).toUpperCase()}`;
  const method = normalizePaymentMethod(payment_method);
  const currency = String(currency_code || invoice.currency_code || 'USD').toUpperCase() === 'LRD' ? 'LRD' : 'USD';
  if (currency !== String(invoice.currency_code || 'USD').toUpperCase()) {
    res.status(400).json({ error: 'Payment currency must match the invoice currency; currency conversion is not supported' });
    return;
  }

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO payments (id, institution_id, payment_number, invoice_id, student_id, amount, payment_method, payment_date, reference_number, received_by, notes, status, currency_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)
    `).run(paymentId, req.institution_id, paymentNumber, invoice_id, invoice.student_id, payAmount, method, payment_date, reference_number || null, req.user?.id || null, notes || null, currency);

    const newPaid = Number(invoice.paid_amount || 0) + payAmount;
    const newBalance = Number(invoice.total_amount || 0) - Number(invoice.discount_amount || 0) - newPaid;
    const newStatus = newBalance <= 0.001 ? 'paid' : 'partial';

    db.prepare(`UPDATE invoices SET paid_amount = ?, balance = ?, status = ?, updated_at = datetime('now') WHERE id = ?`).run(newPaid, Math.max(0, newBalance), newStatus, invoice_id);
  });

  try {
    transaction();
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to record payment' });
    return;
  }
  res.status(201).json({ id: paymentId, payment_number: paymentNumber, message: 'Payment recorded successfully' });
});

feesRouter.get('/mine', (req: AuthRequest, res: Response) => {
  const db = getDatabase();
  let studentIds: string[] = [];
  if (req.user?.user_type === 'student') {
    const row = db.prepare(`
      SELECT id FROM students
      WHERE institution_id = ? AND (
        user_id = ?
        OR admission_number = (SELECT username FROM users WHERE id = ?)
        OR id = (SELECT linked_entity_id FROM users WHERE id = ? AND linked_entity_type = 'student')
      )
    `).get(req.institution_id, req.user.id, req.user.id, req.user.id) as any;
    if (row) studentIds = [row.id];
  } else if (req.user?.user_type === 'parent') {
    const rows = db.prepare(`
      SELECT student_id FROM parent_students WHERE parent_id = ? AND institution_id = ?
    `).all(req.user.id, req.institution_id) as Array<{ student_id: string }>;
    studentIds = rows.map((r) => r.student_id);
  } else {
    res.status(403).json({ error: 'Students and parents only' });
    return;
  }

  if (!studentIds.length) {
    res.json({ invoices: [], payments: [] });
    return;
  }
  const placeholders = studentIds.map(() => '?').join(',');
  const invoices = db.prepare(`
    SELECT i.*, s.first_name, s.last_name, s.admission_number
    FROM invoices i
    JOIN students s ON s.id = i.student_id
    WHERE i.institution_id = ? AND i.student_id IN (${placeholders})
    ORDER BY i.created_at DESC
  `).all(req.institution_id, ...studentIds);
  const payments = db.prepare(`
    SELECT p.*, i.invoice_number, s.first_name, s.last_name
    FROM payments p
    LEFT JOIN invoices i ON i.id = p.invoice_id
    LEFT JOIN students s ON s.id = p.student_id
    WHERE p.institution_id = ? AND p.student_id IN (${placeholders})
    ORDER BY p.payment_date DESC
  `).all(req.institution_id, ...studentIds);
  res.json({ invoices, payments });
});

feesRouter.get('/payments/:id/receipt', (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const db = getDatabase();

  const payment = db.prepare(`
    SELECT p.*, s.first_name, s.last_name, s.admission_number, s.photo,
           c.name as class_name, sec.name as section_name,
           i.invoice_number, i.total_amount, i.balance,
           u.first_name as received_first, u.last_name as received_last
    FROM payments p
    LEFT JOIN students s ON p.student_id = s.id
    LEFT JOIN classes c ON s.class_id = c.id
    LEFT JOIN sections sec ON s.section_id = sec.id
    LEFT JOIN invoices i ON p.invoice_id = i.id
    LEFT JOIN users u ON p.received_by = u.id
    WHERE p.id = ? AND p.institution_id = ?
  `).get(id, req.institution_id) as any;

  if (!payment) { res.status(404).json({ error: 'Payment not found' }); return; }

  const institution = db.prepare('SELECT * FROM institutions WHERE id = ?').get(req.institution_id);
  res.json({ payment, institution });
});

// Due fees report
feesRouter.get('/due', (req: AuthRequest, res: Response) => {
  const db = getDatabase();
  const { class_id, session_id } = req.query as any;

  let where = "WHERE i.institution_id = ? AND i.status IN ('unpaid', 'partial', 'overdue')";
  const params: any[] = [req.institution_id];
  if (class_id) { where += ' AND s.class_id = ?'; params.push(class_id); }
  if (session_id) { where += ' AND i.session_id = ?'; params.push(session_id); }

  const dues = db.prepare(`
    SELECT s.id as student_id, s.admission_number, s.first_name, s.last_name,
           c.name as class_name, sec.name as section_name, i.currency_code,
           SUM(i.balance) as total_due, COUNT(i.id) as invoice_count
    FROM invoices i
    JOIN students s ON i.student_id = s.id
    LEFT JOIN classes c ON s.class_id = c.id
    LEFT JOIN sections sec ON s.section_id = sec.id
    ${where}
    GROUP BY s.id, s.admission_number, s.first_name, s.last_name, c.name, sec.name, i.currency_code
    ORDER BY total_due DESC
  `).all(...params);

  res.json(dues);
});

// Fee collection summary
feesRouter.get('/summary', (req: AuthRequest, res: Response) => {
  const db = getDatabase();
  const { session_id, start_date, end_date } = req.query as any;

  let paymentWhere = "WHERE p.institution_id = ? AND p.status = 'completed'";
  const params: any[] = [req.institution_id];
  if (start_date) { paymentWhere += ' AND p.payment_date >= ?'; params.push(start_date); }
  if (end_date) { paymentWhere += ' AND p.payment_date <= ?'; params.push(end_date); }

  const totalCollected = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM payments p ${paymentWhere}`).get(...params) as any;

  let invoiceWhere = 'WHERE institution_id = ?';
  const invoiceParams: any[] = [req.institution_id];
  if (session_id) { invoiceWhere += ' AND session_id = ?'; invoiceParams.push(session_id); }

  const invoiceStats = db.prepare(`
    SELECT
      COALESCE(SUM(total_amount), 0) as total_billed,
      COALESCE(SUM(discount_amount), 0) as total_discounts,
      COALESCE(SUM(paid_amount), 0) as total_paid,
      COALESCE(SUM(balance), 0) as total_outstanding
    FROM invoices ${invoiceWhere}
  `).get(...invoiceParams) as any;

  const byMethod = db.prepare(`
    SELECT payment_method, COALESCE(SUM(amount), 0) as total, COUNT(*) as count
    FROM payments p ${paymentWhere} GROUP BY payment_method
  `).all(...params);

  res.json({ total_collected: totalCollected.total, ...invoiceStats, by_method: byMethod });
});
