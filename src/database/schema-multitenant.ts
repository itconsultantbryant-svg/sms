export const schemaMultiTenant = `
-- ============================================
-- MULTI-TENANT FOUNDATION SCHEMA
-- AfriMind Tech & AI Consulting Agency (AfriMind) School Management System
-- ============================================

-- ============================================
-- 1. INSTITUTIONS (Top-level tenants)
-- ============================================
CREATE TABLE IF NOT EXISTS institutions (
  id TEXT PRIMARY KEY,
  institution_code TEXT UNIQUE NOT NULL,
  institution_name TEXT NOT NULL,
  institution_type TEXT CHECK(institution_type IN ('primary', 'secondary', 'high_school', 'college', 'university', 'vocational', 'training', 'coaching', 'nursery', 'international', 'religious', 'other')),

  -- Contact Information
  email TEXT,
  phone TEXT,
  mobile TEXT,
  website TEXT,

  -- Address
  address TEXT,
  county TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'Liberia',

  -- Branding
  logo TEXT,
  favicon TEXT,
  motto TEXT,
  primary_color TEXT DEFAULT '#1e40af',
  secondary_color TEXT DEFAULT '#3b82f6',
  accent_color TEXT DEFAULT '#f59e0b',

  -- Configuration
  currency TEXT DEFAULT 'USD',
  currency_symbol TEXT DEFAULT '$',
  timezone TEXT DEFAULT 'Africa/Monrovia',
  date_format TEXT DEFAULT 'DD/MM/YYYY',
  time_format TEXT DEFAULT '24h',
  language TEXT DEFAULT 'en',

  -- Academic Configuration
  academic_year_start_month INTEGER DEFAULT 9,
  academic_year_end_month INTEGER DEFAULT 7,

  -- Number Formats
  student_id_format TEXT DEFAULT 'STU-{YEAR}-{SEQ}',
  employee_id_format TEXT DEFAULT 'EMP-{YEAR}-{SEQ}',
  admission_number_format TEXT DEFAULT 'ADM-{YEAR}-{SEQ}',
  invoice_number_format TEXT DEFAULT 'INV-{YEAR}-{SEQ}',
  receipt_number_format TEXT DEFAULT 'RCP-{YEAR}-{SEQ}',

  -- Subscription & Billing
  subscription_plan TEXT DEFAULT 'trial' CHECK(subscription_plan IN ('trial', 'basic', 'standard', 'premium', 'enterprise')),
  subscription_status TEXT DEFAULT 'active' CHECK(subscription_status IN ('active', 'suspended', 'expired', 'cancelled')),
  subscription_start_date TEXT,
  subscription_end_date TEXT,
  max_students INTEGER DEFAULT 100,
  max_staff INTEGER DEFAULT 20,

  -- Status
  is_active INTEGER DEFAULT 1,
  setup_completed INTEGER DEFAULT 0,

  -- Audit
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 2. BRANCHES (Campuses within institution)
-- ============================================
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  branch_code TEXT NOT NULL,
  branch_name TEXT NOT NULL,

  -- Contact
  email TEXT,
  phone TEXT,
  address TEXT,
  county TEXT,
  city TEXT,

  -- Status
  is_main INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,

  -- Capacity
  student_capacity INTEGER,
  staff_capacity INTEGER,

  -- Audit
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  UNIQUE(institution_id, branch_code)
);

-- ============================================
-- 3. ROLES & PERMISSIONS (Multi-tenant aware)
-- ============================================
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,

  role_code TEXT NOT NULL,
  role_name TEXT NOT NULL,
  description TEXT,

  -- Scope
  is_system_role INTEGER DEFAULT 0,
  is_platform_role INTEGER DEFAULT 0,
  role_level TEXT CHECK(role_level IN ('platform', 'institution', 'branch', 'department')),

  -- Permissions (JSON array of permission codes)
  permissions TEXT,

  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),

  UNIQUE(institution_id, role_code)
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  permission_code TEXT UNIQUE NOT NULL,
  permission_name TEXT NOT NULL,
  module TEXT NOT NULL,
  description TEXT,
  is_system INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 4. USERS (Multi-tenant aware)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id),

  -- Credentials
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,

  -- Personal Info
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  avatar TEXT,

  -- Role & Access
  role_id TEXT REFERENCES roles(id),
  user_type TEXT CHECK(user_type IN ('platform_admin', 'institution_admin', 'branch_admin', 'staff', 'teacher', 'parent', 'student')),

  -- Linked Entity (if applicable)
  linked_entity_type TEXT CHECK(linked_entity_type IN ('employee', 'student', 'parent')),
  linked_entity_id TEXT,

  -- Status
  is_active INTEGER DEFAULT 1,
  email_verified INTEGER DEFAULT 0,
  phone_verified INTEGER DEFAULT 0,
  force_password_change INTEGER DEFAULT 0,

  -- Security
  last_login TEXT,
  last_login_ip TEXT,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TEXT,

  -- Audit
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 5. INSTITUTION SETTINGS (Key-Value per institution)
-- ============================================
CREATE TABLE IF NOT EXISTS institution_settings (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  setting_key TEXT NOT NULL,
  setting_value TEXT,
  setting_type TEXT DEFAULT 'string' CHECK(setting_type IN ('string', 'number', 'boolean', 'json')),
  category TEXT DEFAULT 'general',
  is_encrypted INTEGER DEFAULT 0,

  updated_at TEXT DEFAULT (datetime('now')),

  UNIQUE(institution_id, setting_key)
);

-- ============================================
-- 6. AUDIT LOG (Multi-tenant)
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,

  -- Who
  user_id TEXT REFERENCES users(id),
  username TEXT,
  user_type TEXT,

  -- What
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,

  -- Details
  old_values TEXT,
  new_values TEXT,
  description TEXT,

  -- When & Where
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 7. SUBSCRIPTION & BILLING (Platform level)
-- ============================================
CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  plan_code TEXT UNIQUE NOT NULL,
  plan_name TEXT NOT NULL,
  description TEXT,

  -- Limits
  max_students INTEGER,
  max_staff INTEGER,
  max_branches INTEGER,
  storage_gb INTEGER,

  -- Features (JSON array)
  features TEXT,

  -- Pricing
  price_monthly REAL,
  price_yearly REAL,
  currency TEXT DEFAULT 'USD',

  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS institution_subscriptions (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  plan_id TEXT REFERENCES subscription_plans(id),

  -- Subscription Period
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  billing_cycle TEXT CHECK(billing_cycle IN ('monthly', 'yearly', 'lifetime')),

  -- Payment
  amount REAL,
  currency TEXT DEFAULT 'USD',
  payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  payment_method TEXT,
  payment_reference TEXT,
  payment_date TEXT,

  -- Auto-renewal
  auto_renew INTEGER DEFAULT 1,

  -- Status
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'expired', 'cancelled', 'suspended')),

  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 8. RESELLER/FRANCHISE MANAGEMENT
-- ============================================
CREATE TABLE IF NOT EXISTS resellers (
  id TEXT PRIMARY KEY,
  reseller_code TEXT UNIQUE NOT NULL,
  reseller_name TEXT NOT NULL,

  -- Contact
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,

  -- Commission
  commission_percentage REAL DEFAULT 0,

  -- Status
  is_active INTEGER DEFAULT 1,

  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reseller_institutions (
  id TEXT PRIMARY KEY,
  reseller_id TEXT REFERENCES resellers(id) ON DELETE CASCADE,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,

  commission_rate REAL,
  assigned_date TEXT DEFAULT (datetime('now')),

  UNIQUE(reseller_id, institution_id)
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_institutions_code ON institutions(institution_code);
CREATE INDEX IF NOT EXISTS idx_institutions_status ON institutions(is_active, subscription_status);

CREATE INDEX IF NOT EXISTS idx_branches_institution ON branches(institution_id);
CREATE INDEX IF NOT EXISTS idx_branches_active ON branches(is_active);

CREATE INDEX IF NOT EXISTS idx_roles_institution ON roles(institution_id);

CREATE INDEX IF NOT EXISTS idx_users_institution ON users(institution_id);
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_linked_entity ON users(linked_entity_type, linked_entity_id);

CREATE INDEX IF NOT EXISTS idx_institution_settings_key ON institution_settings(institution_id, setting_key);

CREATE INDEX IF NOT EXISTS idx_audit_logs_institution ON audit_logs(institution_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
`;
