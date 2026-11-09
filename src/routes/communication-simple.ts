import { Router, Response } from 'express';
import { getDatabase } from '../database/init';
import { AuthRequest, authorize } from '../middleware/auth';
import { injectTenant, requireTenant } from '../middleware/tenant';
import { generateId, paginate } from '../utils/helpers';

export const communicationRouter = Router();

communicationRouter.use(injectTenant);
communicationRouter.use(requireTenant);

function resolvePhoneNumbers(db: any, institutionId: string, recipientType: string, phoneNumbers?: string | string[]): string[] {
  if (recipientType === 'individual' || !recipientType) {
    if (!phoneNumbers) return [];
    return Array.isArray(phoneNumbers)
      ? phoneNumbers.map((p) => String(p).trim()).filter(Boolean)
      : String(phoneNumbers).split(',').map((p) => p.trim()).filter(Boolean);
  }

  if (recipientType === 'all_students') {
    return (db.prepare(`SELECT phone FROM students WHERE institution_id = ? AND status = 'active' AND phone IS NOT NULL AND phone != ''`).all(institutionId) as any[]).map((r) => r.phone);
  }
  if (recipientType === 'all_parents') {
    return (db.prepare(`SELECT phone FROM parents WHERE institution_id = ? AND phone IS NOT NULL AND phone != ''`).all(institutionId) as any[]).map((r) => r.phone);
  }
  if (recipientType === 'all_staff') {
    return (db.prepare(`SELECT phone FROM employees WHERE institution_id = ? AND is_active = 1 AND phone IS NOT NULL AND phone != ''`).all(institutionId) as any[]).map((r) => r.phone);
  }
  // Fallback: use any provided numbers
  if (!phoneNumbers) return [];
  return Array.isArray(phoneNumbers)
    ? phoneNumbers.map((p) => String(p).trim()).filter(Boolean)
    : String(phoneNumbers).split(',').map((p) => p.trim()).filter(Boolean);
}

function resolveEmails(db: any, institutionId: string, recipientType: string, emailAddresses?: string | string[]): string[] {
  if (recipientType === 'individual' || !recipientType) {
    if (!emailAddresses) return [];
    return Array.isArray(emailAddresses)
      ? emailAddresses.map((e) => String(e).trim()).filter(Boolean)
      : String(emailAddresses).split(',').map((e) => e.trim()).filter(Boolean);
  }

  if (recipientType === 'all_students') {
    return (db.prepare(`SELECT email FROM students WHERE institution_id = ? AND status = 'active' AND email IS NOT NULL AND email != ''`).all(institutionId) as any[]).map((r) => r.email);
  }
  if (recipientType === 'all_parents') {
    return (db.prepare(`SELECT email FROM parents WHERE institution_id = ? AND email IS NOT NULL AND email != ''`).all(institutionId) as any[]).map((r) => r.email);
  }
  if (recipientType === 'all_staff') {
    return (db.prepare(`SELECT email FROM employees WHERE institution_id = ? AND is_active = 1 AND email IS NOT NULL AND email != ''`).all(institutionId) as any[]).map((r) => r.email);
  }
  if (!emailAddresses) return [];
  return Array.isArray(emailAddresses)
    ? emailAddresses.map((e) => String(e).trim()).filter(Boolean)
    : String(emailAddresses).split(',').map((e) => e.trim()).filter(Boolean);
}

communicationRouter.get('/sms', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = '1', limit = '20' } = req.query as any;
    const { limit: lim, offset } = paginate(parseInt(page), parseInt(limit));

    const total = db.prepare('SELECT COUNT(*) as count FROM sms_messages WHERE institution_id = ?').get(req.institution_id) as any;
    const messages = db.prepare(`
      SELECT m.*, u.first_name || ' ' || u.last_name as sender_name
      FROM sms_messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE m.institution_id = ?
      ORDER BY m.created_at DESC LIMIT ? OFFSET ?
    `).all(req.institution_id, lim, offset);

    res.json({ data: messages, total: total.count, page: parseInt(page), limit: lim });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

communicationRouter.post('/sms', authorize('platform_admin', 'institution_admin', 'staff', 'teacher'), (req: AuthRequest, res: Response) => {
  res.status(503).json({ error: 'SMS delivery is not configured. No message has been sent. Configure an approved provider before enabling delivery.', code: 'SMS_PROVIDER_REQUIRED' });
});

communicationRouter.get('/emails', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = '1', limit = '20' } = req.query as any;
    const { limit: lim, offset } = paginate(parseInt(page), parseInt(limit));

    const total = db.prepare('SELECT COUNT(*) as count FROM email_messages WHERE institution_id = ?').get(req.institution_id) as any;
    const messages = db.prepare(`
      SELECT m.*, u.first_name || ' ' || u.last_name as sender_name
      FROM email_messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE m.institution_id = ?
      ORDER BY m.created_at DESC LIMIT ? OFFSET ?
    `).all(req.institution_id, lim, offset);

    res.json({ data: messages, total: total.count, page: parseInt(page), limit: lim });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

communicationRouter.post('/emails', authorize('platform_admin', 'institution_admin', 'staff', 'teacher'), (req: AuthRequest, res: Response) => {
  res.status(503).json({ error: 'Email delivery is not configured. No message has been sent. Configure an approved provider before enabling delivery.', code: 'EMAIL_PROVIDER_REQUIRED' });
});

communicationRouter.get('/announcements', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = '1', limit = '20', published } = req.query as any;
    const { limit: lim, offset } = paginate(parseInt(page), parseInt(limit));

    let where = 'WHERE institution_id = ?';
    const params: any[] = [req.institution_id];
    if (published !== undefined) {
      where += ' AND is_published = ?';
      params.push(parseInt(published));
    }

    const total = db.prepare(`SELECT COUNT(*) as count FROM announcements ${where}`).get(...params) as any;
    const announcements = db.prepare(`SELECT * FROM announcements ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, lim, offset);

    res.json({ data: announcements, total: total.count, page: parseInt(page), limit: lim });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

communicationRouter.post('/announcements', authorize('platform_admin', 'institution_admin'), (req: AuthRequest, res: Response) => {
  try {
    const { title, content, type, priority, audience, is_published } = req.body;
    if (!title || !content) {
      res.status(400).json({ error: 'Title and content required' });
      return;
    }

    const db = getDatabase();
    const id = generateId();
    const published = is_published ? 1 : 0;

    db.prepare(`
      INSERT INTO announcements (
        id, institution_id, title, content, type, priority, audience, is_published, published_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.institution_id,
      title,
      content,
      type || 'general',
      priority || 'normal',
      audience || 'all',
      published,
      published ? new Date().toISOString() : null,
      req.user?.id || null
    );

    res.status(201).json({ id, message: 'Announcement created' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

communicationRouter.put('/announcements/:id', authorize('platform_admin', 'institution_admin'), (req: AuthRequest, res: Response) => {
  try {
    const { title, content, type, priority, audience, is_published, expires_at } = req.body;
    const db = getDatabase();
    const result = db.prepare(`
      UPDATE announcements SET
        title = COALESCE(?, title),
        content = COALESCE(?, content),
        type = COALESCE(?, type),
        priority = COALESCE(?, priority),
        audience = COALESCE(?, audience),
        is_published = COALESCE(?, is_published),
        published_at = CASE WHEN COALESCE(?, is_published) = 1 AND published_at IS NULL THEN datetime('now') ELSE published_at END,
        expires_at = COALESCE(?, expires_at),
        updated_at = datetime('now')
      WHERE id = ? AND institution_id = ?
    `).run(
      title ?? null,
      content ?? null,
      type ?? null,
      priority ?? null,
      audience ?? null,
      is_published === undefined ? null : (is_published ? 1 : 0),
      is_published === undefined ? null : (is_published ? 1 : 0),
      expires_at ?? null,
      req.params.id,
      req.institution_id
    );
    if (!result.changes) {
      res.status(404).json({ error: 'Announcement not found' });
      return;
    }
    res.json({ message: 'Announcement updated' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

communicationRouter.delete('/announcements/:id', authorize('platform_admin', 'institution_admin'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare('DELETE FROM announcements WHERE id = ? AND institution_id = ?').run(req.params.id, req.institution_id);
    res.json({ message: 'Announcement deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

communicationRouter.get('/templates', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const templates = db.prepare(`
      SELECT * FROM notification_templates
      WHERE institution_id = ? AND is_active = 1
      ORDER BY event
    `).all(req.institution_id);
    res.json(templates);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

communicationRouter.post('/templates', authorize('platform_admin', 'institution_admin'), (req: AuthRequest, res: Response) => {
  try {
    const { name, type, event, subject, body, variables } = req.body;
    if (!name || !type || !event || !body) {
      res.status(400).json({ error: 'Name, type, event and body required' });
      return;
    }

    const db = getDatabase();
    const id = generateId();
    db.prepare(`
      INSERT INTO notification_templates (id, institution_id, name, type, event, subject, body, variables)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.institution_id, name, type, event, subject || null, body, variables || null);

    res.status(201).json({ id, message: 'Template created' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

communicationRouter.put('/templates/:id', authorize('platform_admin', 'institution_admin'), (req: AuthRequest, res: Response) => {
  try {
    const { name, type, event, subject, body, is_active } = req.body;
    const db = getDatabase();
    const result = db.prepare(`
      UPDATE notification_templates SET
        name = COALESCE(?, name),
        type = COALESCE(?, type),
        event = COALESCE(?, event),
        subject = COALESCE(?, subject),
        body = COALESCE(?, body),
        is_active = COALESCE(?, is_active)
      WHERE id = ? AND institution_id = ?
    `).run(
      name ?? null,
      type ?? null,
      event ?? null,
      subject ?? null,
      body ?? null,
      is_active === undefined ? null : (is_active ? 1 : 0),
      req.params.id,
      req.institution_id
    );
    if (!result.changes) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json({ message: 'Template updated' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

communicationRouter.delete('/templates/:id', authorize('platform_admin', 'institution_admin'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare('DELETE FROM notification_templates WHERE id = ? AND institution_id = ?').run(req.params.id, req.institution_id);
    res.json({ message: 'Template deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

communicationRouter.get('/log', (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { page = '1', limit = '50' } = req.query as any;
    const { limit: lim, offset } = paginate(parseInt(page), parseInt(limit));

    const total = db.prepare('SELECT COUNT(*) as count FROM communication_log WHERE institution_id = ?').get(req.institution_id) as any;
    const logs = db.prepare(`
      SELECT * FROM communication_log
      WHERE institution_id = ?
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(req.institution_id, lim, offset);

    res.json({ data: logs, total: total.count, page: parseInt(page), limit: lim });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
