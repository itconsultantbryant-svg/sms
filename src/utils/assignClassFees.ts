import { getDatabase } from '../database/init';
import { generateId } from './helpers';

export type FeeAssignmentResult = {
  students: number;
  invoices: number;
  items: number;
};

let columnReady = false;

function ensureFeeStructureColumn(): void {
  if (columnReady) return;
  const db = getDatabase();
  const cols = db.prepare('PRAGMA table_info(invoice_items)').all() as Array<{ name: string }>;
  if (cols.length && !cols.some((c) => c.name === 'fee_structure_id')) {
    db.exec('ALTER TABLE invoice_items ADD COLUMN fee_structure_id TEXT');
  }
  columnReady = true;
}

function invoiceNumber(): string {
  return `INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function studentDiscount(studentId: string, sessionId: string, institutionId: string, amount: number): number {
  const db = getDatabase();
  try {
    const discounts = db.prepare(`
      SELECT fd.type, fd.value FROM fee_discounts fd
      JOIN student_discounts sd ON fd.id = sd.discount_id
      WHERE sd.student_id = ? AND sd.session_id = ? AND fd.institution_id = ? AND (fd.is_active = 1 OR fd.is_active IS NULL)
    `).all(studentId, sessionId, institutionId) as Array<{ type: string; value: number }>;
    let discount = 0;
    for (const d of discounts) {
      discount += d.type === 'percentage' ? (amount * Number(d.value || 0)) / 100 : Number(d.value || 0);
    }
    return Math.min(Math.max(discount, 0), amount);
  } catch {
    return 0;
  }
}

/**
 * Create or extend invoices so every active student in a class is billed
 * for that class fee. Safe to run more than once — a fee structure is only
 * added to a student once.
 */
export function assignClassFees(opts: {
  institutionId: string;
  createdBy?: string | null;
  structureId?: string | null;
  classId?: string | null;
  studentId?: string | null;
  sessionId?: string | null;
}): FeeAssignmentResult {
  const result: FeeAssignmentResult = { students: 0, invoices: 0, items: 0 };
  if (!opts.institutionId) return result;

  ensureFeeStructureColumn();
  const db = getDatabase();

  const structures = db.prepare(`
    SELECT fs.id, fs.fee_type_id, fs.session_id, fs.term_id, fs.branch_id, fs.class_id, fs.amount, fs.due_date,
           COALESCE(fs.currency_code, 'USD') as currency_code, ft.name as fee_type_name
    FROM fee_structures fs
    LEFT JOIN fee_types ft ON ft.id = fs.fee_type_id
    WHERE fs.institution_id = ?
      AND (fs.is_active = 1 OR fs.is_active IS NULL)
      AND fs.class_id IS NOT NULL
      AND (? IS NULL OR fs.id = ?)
      AND (? IS NULL OR fs.class_id = ?)
      AND (? IS NULL OR fs.session_id = ?)
  `).all(
    opts.institutionId,
    opts.structureId || null,
    opts.structureId || null,
    opts.classId || null,
    opts.classId || null,
    opts.sessionId || null,
    opts.sessionId || null
  ) as any[];

  if (!structures.length) return result;

  const billed = new Set(
    (db.prepare(`
      SELECT i.student_id || ':' || ii.fee_structure_id as key
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      WHERE i.institution_id = ? AND ii.fee_structure_id IS NOT NULL AND i.status != 'cancelled'
    `).all(opts.institutionId) as Array<{ key: string }>).map((row) => row.key)
  );

  const touchedStudents = new Set<string>();
  const insertItem = db.prepare(`
    INSERT INTO invoice_items (id, institution_id, invoice_id, fee_type_id, fee_structure_id, description, amount, discount, net_amount, currency_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertInvoice = db.prepare(`
    INSERT INTO invoices (
      id, institution_id, invoice_number, student_id, session_id, term_id,
      total_amount, discount_amount, paid_amount, balance, due_date, status, created_by, currency_code
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'unpaid', ?, ?)
  `);
  const addToInvoice = db.prepare(`
    UPDATE invoices
    SET total_amount = total_amount + ?,
        discount_amount = discount_amount + ?,
        balance = balance + ?,
        due_date = COALESCE(due_date, ?),
        updated_at = datetime('now')
    WHERE id = ?
  `);

  const apply = db.transaction(() => {
    for (const structure of structures) {
      const amount = Number(structure.amount || 0);
      if (!structure.class_id || amount < 0) continue;

      let studentSql = `
        SELECT id, branch_id FROM students
        WHERE institution_id = ? AND class_id = ?
          AND (status IS NULL OR status = 'active')
      `;
      const studentParams: any[] = [opts.institutionId, structure.class_id];
      if (opts.studentId) {
        studentSql += ' AND id = ?';
        studentParams.push(opts.studentId);
      }
      if (structure.branch_id) {
        studentSql += ' AND (branch_id IS NULL OR branch_id = ?)';
        studentParams.push(structure.branch_id);
      }
      const students = db.prepare(studentSql).all(...studentParams) as Array<{ id: string }>;

      for (const student of students) {
        const key = `${student.id}:${structure.id}`;
        if (billed.has(key)) continue;

        const legacy = db.prepare(`
          SELECT ii.id FROM invoice_items ii
          JOIN invoices i ON i.id = ii.invoice_id
          WHERE i.institution_id = ? AND i.student_id = ? AND i.status != 'cancelled'
            AND ii.fee_type_id = ? AND i.session_id = ?
            AND ((? IS NULL AND i.term_id IS NULL) OR i.term_id = ?)
            AND COALESCE(i.currency_code, 'USD') = ?
        `).get(
          opts.institutionId,
          student.id,
          structure.fee_type_id,
          structure.session_id,
          structure.term_id,
          structure.term_id,
          String(structure.currency_code || 'USD').toUpperCase() === 'LRD' ? 'LRD' : 'USD'
        );
        if (legacy) {
          billed.add(key);
          continue;
        }

        const discount = studentDiscount(student.id, structure.session_id, opts.institutionId, amount);
        const net = Math.max(0, amount - discount);
        const description = structure.fee_type_name || 'School fee';
        const currency = String(structure.currency_code || 'USD').toUpperCase() === 'LRD' ? 'LRD' : 'USD';

        const openInvoice = db.prepare(`
          SELECT id FROM invoices
          WHERE institution_id = ? AND student_id = ? AND session_id = ?
            AND ((? IS NULL AND term_id IS NULL) OR term_id = ?)
            AND COALESCE(currency_code, 'USD') = ?
            AND status IN ('unpaid', 'partial', 'overdue')
          ORDER BY created_at DESC LIMIT 1
        `).get(opts.institutionId, student.id, structure.session_id, structure.term_id, structure.term_id, currency) as { id: string } | undefined;

        if (openInvoice) {
          insertItem.run(generateId(), opts.institutionId, openInvoice.id, structure.fee_type_id, structure.id, description, amount, discount, net, currency);
          addToInvoice.run(amount, discount, net, structure.due_date || null, openInvoice.id);
        } else {
          const invoiceId = generateId();
          insertInvoice.run(
            invoiceId,
            opts.institutionId,
            invoiceNumber(),
            student.id,
            structure.session_id,
            structure.term_id || null,
            amount,
            discount,
            net,
            structure.due_date || null,
            opts.createdBy || null,
            currency
          );
          insertItem.run(generateId(), opts.institutionId, invoiceId, structure.fee_type_id, structure.id, description, amount, discount, net, currency);
          result.invoices += 1;
        }

        billed.add(key);
        touchedStudents.add(student.id);
        result.items += 1;
      }
    }
  });

  apply();
  result.students = touchedStudents.size;
  return result;
}
