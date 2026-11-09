import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthRequest, hasPermission } from './auth';
import { injectTenant } from './tenant';
import { getDatabase } from '../database/init';

function resourceOf(path: string): { resource: string; id: string } | null {
  const attendance = path.match(/^\/api\/attendance\/sessions\/([^/]+)$/);
  if (attendance) return { resource: 'attendance', id: attendance[1] };
  const gradebook = path.match(/^\/api\/gradebook\/([^/]+)(?:\/(entries|columns|submit|approve|reject))?$/);
  if (gradebook && !['mine', 'pending', 'generate', 'import', 'promote'].includes(gradebook[1])) return { resource: 'gradebook', id: gradebook[1] };
  const generic = path.match(/^\/api\/records\/(attendance|gradebooks)\/([^/]+)$/);
  if (generic) return { resource: generic[1] === 'attendance' ? 'attendance' : 'gradebook', id: generic[2] };
  return null;
}

export function supportsOfflineWrite(method: string, path: string): boolean {
  return (method === 'POST' && path === '/api/attendance/take')
    || (method === 'PUT' && /^\/api\/attendance\/sessions\/[^/]+$/.test(path))
    || (method === 'PUT' && /^\/api\/gradebook\/[^/]+\/entries$/.test(path))
    || (method === 'POST' && /^\/api\/teachers\/[^/]+\/assignments$/.test(path));
}

/** Applied after authentication. All replayed handlers are synchronous; their
 * business changes, revision update and receipt commit in one DB transaction.
 * Only the explicitly supported daily workflows may be queued by the client. */
export function offlineConsistency(req: AuthRequest, res: Response, next: NextFunction): void {
  const path = req.originalUrl.split('?')[0].replace(/\/$/, '');
  const operation = req.header('X-Offline-Operation');
  const resource = resourceOf(path);
  if (!operation && !resource) { next(); return; }
  injectTenant(req, res, () => {
    if (!req.institution_id || !req.user) {
      if (operation) { res.status(400).json({ error: 'Select a school before synchronizing' }); return; }
      next(); return;
    }
    const db = getDatabase();
    const institution = req.institution_id;
    const user = req.user;
    const originalJson = res.json.bind(res);
    if (req.method === 'GET') {
      if (resource) {
        const row = db.prepare('SELECT version FROM offline_revisions WHERE institution_id = ? AND resource = ? AND record_id = ?').get(institution, resource.resource, resource.id) as any;
        res.setHeader('X-Offline-Version', String(row?.version || 0));
      }
      next(); return;
    }
    if (operation && (!/^[0-9a-f-]{36}$/i.test(operation) || !supportsOfflineWrite(req.method, path))) {
      res.status(400).json({ error: 'This action cannot be synchronized offline' }); return;
    }
    if (operation) {
      const admin = ['platform_admin', 'institution_admin'].includes(user.user_type);
      const teacher = user.user_type === 'teacher' || user.role_codes?.includes('teacher');
      const allowed = path.includes('/teachers/') ? admin
        : path.includes('/gradebook/') ? admin || teacher
        : admin || hasPermission(req, 'attendance.mark');
      if (!allowed) { res.status(403).json({ error: 'Your current access does not allow this offline operation' }); return; }
      if (resource && !/^\d+$/.test(req.header('X-Offline-Version') || '')) {
        res.status(428).json({ error: 'A previously downloaded record version is required' }); return;
      }
    }
    let body: any;
    let captured = false;
    let resultStatus = 200;
    const hash = crypto.createHash('sha256').update(JSON.stringify({ user: user.id, institution, method: req.method, path, body: req.body })).digest('hex');
    try {
      db.transaction(() => {
        if (operation) {
          // Insert first: unique ID serializes concurrent retries across servers.
          const inserted = db.prepare(`INSERT INTO offline_operations (id, user_id, institution_id, request_hash, status_code, response_body) VALUES (?, ?, ?, ?, 0, '') ON CONFLICT DO NOTHING`).run(operation, user.id, institution, hash);
          if (!inserted.changes) {
            const prior = db.prepare('SELECT * FROM offline_operations WHERE id = ?').get(operation) as any;
            if (!prior || prior.user_id !== user.id || prior.institution_id !== institution || prior.request_hash !== hash) {
              resultStatus = 409; body = { error: 'Operation ID is already associated with a different request' };
            } else {
              resultStatus = prior.status_code; body = JSON.parse(prior.response_body);
              res.setHeader('X-Offline-Replayed', 'true');
            }
            captured = true; return;
          }
        }
        if (resource) {
          db.prepare('INSERT INTO offline_revisions (institution_id, resource, record_id, version) VALUES (?, ?, ?, 0) ON CONFLICT DO NOTHING').run(institution, resource.resource, resource.id);
          const expected = req.header('X-Offline-Version');
          const changed = operation
            ? db.prepare('UPDATE offline_revisions SET version = version + 1 WHERE institution_id = ? AND resource = ? AND record_id = ? AND version = ?').run(institution, resource.resource, resource.id, Number(expected))
            : db.prepare('UPDATE offline_revisions SET version = version + 1 WHERE institution_id = ? AND resource = ? AND record_id = ?').run(institution, resource.resource, resource.id);
          if (!changed.changes) {
            resultStatus = 409; body = { error: 'This record changed on another device. Review your saved offline changes before re-entering them.' }; captured = true;
            throw new Error('OFFLINE_ROLLBACK');
          }
        }
        res.json = ((value: any) => { body = value; resultStatus = res.statusCode; captured = true; return res; }) as any;
        next();
        if (!captured) throw new Error('Offline transaction requires a synchronous JSON handler');
        if (resultStatus >= 400) throw new Error('OFFLINE_ROLLBACK');
        if (operation) db.prepare('UPDATE offline_operations SET status_code = ?, response_body = ? WHERE id = ?').run(resultStatus, JSON.stringify(body), operation);
      })();
      res.json = originalJson;
      if (operation && resultStatus >= 200 && resultStatus < 300) res.setHeader('X-Offline-Acknowledged', operation);
      res.status(resultStatus).json(body);
    } catch (error: any) {
      res.json = originalJson;
      if (captured) { res.status(resultStatus).json(body); return; }
      console.error('Offline consistency failure:', error.message);
      res.status(500).json({ error: 'Could not safely save this operation; your local copy has not been deleted' });
    }
  });
}
