import { getDatabase } from './init';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const SUPERADMIN_USERNAME = process.env.BOOTSTRAP_ADMIN_USERNAME || 'superadmin';
const SUPERADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@softwarevala.com';

/**
 * One-time administrator bootstrap. Never reset an existing account on startup.
 */
export function ensureAdminUser() {
  const db = getDatabase();

  try {
    let platformAdminRole = db
      .prepare("SELECT id FROM roles WHERE role_code = 'platform_admin' LIMIT 1")
      .get() as any;

    if (!platformAdminRole) {
      const roleId = uuidv4();
      db.prepare(`
        INSERT INTO roles (
          id, institution_id, role_code, role_name, description,
          is_system_role, is_platform_role, role_level, permissions, is_active
        ) VALUES (?, NULL, 'platform_admin', 'Platform Administrator',
                  'Full system access across all institutions',
                  1, 1, 'platform', '[]', 1)
      `).run(roleId);
      platformAdminRole = { id: roleId };
      console.log('✓ Created platform_admin role');
    }

    const existing = db
      .prepare('SELECT id, username FROM users WHERE username = ?')
      .get(SUPERADMIN_USERNAME) as any;

    if (existing) {
      if (process.env.ELECTRON_MODE === 'true') ensureOfflineInstitution();
      return;
    }

    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!password || password.length < 16) {
      throw new Error('Set BOOTSTRAP_ADMIN_PASSWORD (at least 16 characters) for first-time setup');
    }
    const hashedPassword = bcrypt.hashSync(password, 12);

    const userId = uuidv4();
    db.prepare(`
      INSERT INTO users (
        id, institution_id, branch_id, username, email, password_hash,
        first_name, last_name, role_id, user_type, is_active, email_verified
      ) VALUES (?, NULL, NULL, ?, ?, ?, 'Platform', 'Superadmin', ?, 'platform_admin', 1, 1)
    `).run(userId, SUPERADMIN_USERNAME, SUPERADMIN_EMAIL, hashedPassword, platformAdminRole.id);

    console.log('✓ Superadmin user created');
    console.log(`  Username: ${SUPERADMIN_USERNAME}`);

    // On the desktop/offline build, seed a default institution and a school
    // admin so the freshly installed app is usable without a cloud connection.
    // Online deployments skip this — schools are created via the platform admin.
    if (process.env.ELECTRON_MODE === 'true') {
      ensureOfflineInstitution();
    }
  } catch (error) {
    console.error('Error ensuring superadmin user:', error);
    throw error;
  }
}

/**
 * Seed a default OFFLINE institution + a school administrator so a school can
 * open the desktop app, activate a license, and log in immediately — no network
 * required. Idempotent: only created when missing.
 */
function ensureOfflineInstitution() {
  const db = getDatabase();
  try {
    let institution = db
      .prepare("SELECT id FROM institutions WHERE institution_code = 'OFFLINE' LIMIT 1")
      .get() as any;

    if (!institution) {
      const { v4: uuidv4 } = require('uuid');
      const instId = uuidv4();
      db.prepare(
        `
        INSERT INTO institutions
        (id, institution_code, institution_name, institution_type, country, currency, currency_symbol, setup_completed)
        VALUES (?, 'OFFLINE', 'Offline School', 'other', 'Liberia', 'USD', '$', 1)
      `
      ).run(instId);
      institution = { id: instId };
      console.log('✓ Offline institution created (OFFLINE)');
    }

    const instId = institution.id;

    // Ensure an institution_admin role for this tenant.
    let adminRole = db
      .prepare("SELECT id FROM roles WHERE role_code = 'institution_admin' AND institution_id = ? LIMIT 1")
      .get(instId) as any;
    if (!adminRole) {
      const { v4: uuidv4 } = require('uuid');
      const roleId = uuidv4();
      db.prepare(
        `
        INSERT INTO roles
        (id, institution_id, role_code, role_name, description, is_system_role, role_level, permissions, is_active)
        VALUES (?, ?, 'institution_admin', 'Institution Administrator', 'Full access to this institution', 1, 'institution', '[]', 1)
      `
      ).run(roleId, instId);
      adminRole = { id: roleId };
    }

    // Ensure a default school admin user the school can sign in with.
    const existingAdmin = db
      .prepare("SELECT id FROM users WHERE username = 'schooladmin' LIMIT 1")
      .get() as any;
    if (!existingAdmin) {
      const { v4: uuidv4 } = require('uuid');
      const userId = uuidv4();
      const password = process.env.BOOTSTRAP_SCHOOL_PASSWORD;
      if (!password || password.length < 16) throw new Error('Set BOOTSTRAP_SCHOOL_PASSWORD for offline setup');
      const hashedPassword = bcrypt.hashSync(password, 12);
      db.prepare(
        `
        INSERT INTO users
        (id, institution_id, branch_id, username, email, password_hash, first_name, last_name, role_id, user_type, is_active, email_verified)
        VALUES (?, ?, NULL, 'schooladmin', 'schooladmin@offline.local', ?, 'School', 'Administrator', ?, 'institution_admin', 1, 1)
      `
      ).run(userId, instId, hashedPassword, adminRole.id);
      console.log('✓ Offline school admin created');
      console.log('  Username: schooladmin');
    }
  } catch (error) {
    console.error('Error ensuring offline institution:', error);
  }
}
