import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDatabase } from '../database/init';
import { isExpired, getDaysRemaining } from '../utils/licensing';
import { getMergedAccessForUser, userHasAnyPermission } from '../utils/userAccess';
import { JWT_SECRET } from '../config/environment';

// CRITICAL: Must match the secret in routes/auth.ts!

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    role_id: string | null;
    role_name: string | null;
    role_code: string | null;
    user_type: string;
    institution_id: string | null;
    branch_id: string | null;
    // License fields
    license_mode?: string;
    license_expiry?: string;
    license_tier?: string;
    days_remaining?: number;
    license_id?: string;
    // Multi-role merge
    roles?: Array<{ id: string; code: string | null; name: string | null }>;
    role_codes?: string[];
    permissions?: string[];
  };
  institution_id?: string | null;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;


  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('❌ No auth header or invalid format');
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    console.log('✅ Token verified, userId:', decoded.userId);

    const db = getDatabase();
    // LEFT JOIN because role_id might be NULL
    const user = db.prepare(`
      SELECT
        u.id, u.username, u.email, u.first_name, u.last_name,
        u.role_id, u.user_type,
        u.institution_id, u.branch_id,
        r.role_code, r.role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = ? AND u.is_active = 1
    `).get(decoded.userId) as any;

    console.log('User lookup result:', { found: !!user, userId: decoded.userId });

    if (!user) {
      console.log('❌ User not found or inactive');
      res.status(401).json({ error: 'User not found or inactive' });
      return;
    }

    // Attach merged multi-role access
    const access = getMergedAccessForUser(user.id, user.role_id);
    user.roles = access.roles;
    user.role_codes = access.role_codes;
    user.permissions = access.permissions;
    if (access.primary_role_id) {
      user.role_id = access.primary_role_id;
      const primary = access.roles.find((r) => r.id === access.primary_role_id);
      if (primary) {
        user.role_code = primary.code;
        user.role_name = primary.name;
      }
    }

    // Platform superadmin manages the whole system — never gated by school licenses
    if (user.user_type === 'platform_admin') {
      user.license_mode = 'production';
      user.license_tier = 'enterprise';
      user.days_remaining = null;
      req.user = user;
      console.log('✅ Auth successful (platform admin):', user.username);
      next();
      return;
    }

    // Check license status after user is authenticated
    let license = db
      .prepare(
        `
        SELECT * FROM licenses
        WHERE institution_id = ? AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
      `
      )
      .get(user.institution_id) as any;

    // Online SaaS: auto-provision a cloud license for schools that never received one
    if (!license && user.institution_id) {
      try {
        const { v4: uuidv4 } = require('uuid');
        const id = uuidv4();
        const expiry = new Date();
        expiry.setFullYear(expiry.getFullYear() + 1);
        const key = `SVL-CLOUD-${String(user.institution_id).slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
        db.prepare(`
          INSERT INTO licenses (
            id, institution_id, license_key, mode, plan_tier, expiry_date, status, activated_at
          ) VALUES (?, ?, ?, 'production', 'standard', ?, 'active', datetime('now'))
        `).run(id, user.institution_id, key, expiry.toISOString().split('T')[0]);
        license = db.prepare('SELECT * FROM licenses WHERE id = ?').get(id) as any;
        console.log('✓ Auto-provisioned cloud license for institution', user.institution_id);
      } catch (e) {
        console.error('Failed to auto-provision license:', e);
      }
    }

    if (license) {
      const expiryDate = new Date(license.expiry_date);
      const expired = isExpired(expiryDate);

      // Attach license info to user object
      user.license_mode = license.mode;
      user.license_expiry = license.expiry_date;
      user.license_tier = license.plan_tier;
      user.days_remaining = expired ? 0 : getDaysRemaining(expiryDate);
      user.license_id = license.id;

      // Check if license is expired
      if (expired) {
        if (license.mode === 'demo') {
          console.log('❌ Demo license expired');
          res.status(403).json({
            error: 'Demo expired',
            redirect: '/setup',
            expiry: license.expiry_date,
          });
          return;
        } else {
          console.log('❌ Production license expired');
          res.status(403).json({
            error: 'License expired',
            redirect: '/setup',
            expiry: license.expiry_date,
          });
          return;
        }
      }
    } else {
      console.log('❌ No license found for institution');
      res.status(403).json({
        error: 'License required',
        redirect: '/setup',
      });
      return;
    }

    req.user = user;
    console.log('✅ Auth successful:', user.username);
    next();
  } catch (error: any) {
    console.error('❌ Token verification failed:', error.message);
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (roles.length > 0) {
      const userRoleCode = req.user.role_code || '';
      const userType = req.user.user_type || '';
      const roleCodes = req.user.role_codes || [];
      const allowed =
        roles.includes(userRoleCode) ||
        roles.includes(userType) ||
        roleCodes.some((c) => roles.includes(c));
      if (!allowed) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
    }
    next();
  };
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
}

// Permission-based authorization
export function requirePermission(...permissions: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (userHasAnyPermission(req.user.id, req.user.user_type, req.user.role_id, permissions)) {
      next();
      return;
    }

    res.status(403).json({
      error: 'Insufficient permissions',
      required: permissions,
      message: 'You do not have permission to perform this action'
    });
  };
}

// Check if user has specific permission (for conditional logic)
export function hasPermission(req: AuthRequest, permission: string): boolean {
  if (!req.user) return false;
  return userHasAnyPermission(req.user.id, req.user.user_type, req.user.role_id, [permission]);
}
