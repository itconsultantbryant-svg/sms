export const schemaV2Consolidated = `
-- ============================================
-- CONSOLIDATED MULTI-TENANT SCHEMA V2
-- AfriMind Tech & AI Consulting Agency (AfriMind) School Management System
-- Complete system schema with institution_id for tenant isolation
-- ============================================

-- ============================================
-- SECTION 1: MULTI-TENANT FOUNDATION
-- Platform-level and tenant management tables
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

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
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
  module TEXT NOT NULL,

  -- Details
  old_values TEXT,
  new_values TEXT,
  details TEXT,
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
-- SECTION 2: ADMISSION MODULE
-- Complete admission workflow from enquiry to student
-- ============================================

-- ============================================
-- 1. ADMISSION ENQUIRIES
-- ============================================
CREATE TABLE IF NOT EXISTS admission_enquiries (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id),

  -- Enquiry Details
  enquiry_number TEXT UNIQUE NOT NULL,
  enquiry_date TEXT DEFAULT (date('now')),
  enquiry_source TEXT CHECK(enquiry_source IN ('walk_in', 'phone', 'email', 'website', 'social_media', 'referral', 'advertisement', 'other')),

  -- Prospective Student
  student_first_name TEXT NOT NULL,
  student_middle_name TEXT,
  student_last_name TEXT NOT NULL,
  student_dob TEXT,
  student_gender TEXT CHECK(student_gender IN ('male', 'female', 'other')),

  -- Academic Interest
  desired_class_id TEXT REFERENCES classes(id),
  desired_session_id TEXT REFERENCES academic_sessions(id),
  previous_school TEXT,
  previous_class TEXT,

  -- Parent/Guardian
  parent_name TEXT NOT NULL,
  parent_phone TEXT NOT NULL,
  parent_email TEXT,
  parent_address TEXT,
  parent_occupation TEXT,

  -- Status & Follow-up
  status TEXT DEFAULT 'new' CHECK(status IN ('new', 'contacted', 'follow_up', 'scheduled', 'converted', 'rejected', 'closed')),
  priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),

  -- Follow-up
  next_follow_up_date TEXT,
  follow_up_count INTEGER DEFAULT 0,
  notes TEXT,

  -- Conversion
  converted_to_application_id TEXT,
  converted_at TEXT,

  -- Assignment
  assigned_to TEXT REFERENCES users(id),

  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 2. ENQUIRY FOLLOW-UPS
-- ============================================
CREATE TABLE IF NOT EXISTS enquiry_followups (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  enquiry_id TEXT NOT NULL REFERENCES admission_enquiries(id) ON DELETE CASCADE,

  followup_date TEXT NOT NULL,
  followup_type TEXT CHECK(followup_type IN ('call', 'email', 'sms', 'visit', 'other')),
  notes TEXT,
  outcome TEXT,

  next_action_date TEXT,
  next_action TEXT,

  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 3. ADMISSION APPLICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS admission_applications (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id),

  -- Application Details
  application_number TEXT UNIQUE NOT NULL,
  application_date TEXT DEFAULT (date('now')),
  enquiry_id TEXT REFERENCES admission_enquiries(id),

  -- Student Information
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  date_of_birth TEXT,
  gender TEXT CHECK(gender IN ('male', 'female', 'other')),
  nationality TEXT DEFAULT 'Liberian',
  religion TEXT,
  blood_group TEXT,

  -- Address
  address TEXT,
  county TEXT,
  city TEXT,
  postal_code TEXT,

  -- Contact
  phone TEXT,
  email TEXT,

  -- Academic Background
  previous_school TEXT,
  previous_class TEXT,
  previous_percentage REAL,
  previous_board TEXT,
  previous_year INTEGER,
  transfer_certificate_number TEXT,

  -- Medical Information
  medical_conditions TEXT,
  allergies TEXT,
  special_needs TEXT,

  -- Applied For
  desired_class_id TEXT REFERENCES classes(id),
  desired_section_id TEXT REFERENCES sections(id),
  desired_session_id TEXT REFERENCES academic_sessions(id),

  -- Application Status
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'submitted', 'under_review', 'interview_scheduled', 'test_scheduled', 'approved', 'rejected', 'waitlisted', 'cancelled')),

  -- Workflow
  submitted_at TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  review_notes TEXT,

  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  approval_notes TEXT,

  rejected_by TEXT REFERENCES users(id),
  rejected_at TEXT,
  rejection_reason TEXT,

  -- Conversion
  converted_to_student_id TEXT,
  converted_at TEXT,

  -- Fees
  application_fee REAL DEFAULT 0,
  application_fee_paid INTEGER DEFAULT 0,
  payment_reference TEXT,

  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 4. PARENT/GUARDIAN INFORMATION (from application)
-- ============================================
CREATE TABLE IF NOT EXISTS application_parents (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL REFERENCES admission_applications(id) ON DELETE CASCADE,

  relationship TEXT CHECK(relationship IN ('father', 'mother', 'guardian', 'other')),
  is_primary INTEGER DEFAULT 0,

  -- Personal Info
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  occupation TEXT,
  employer TEXT,
  annual_income TEXT,

  -- Address (if different)
  address TEXT,

  -- Emergency Contact
  is_emergency_contact INTEGER DEFAULT 0,

  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 5. APPLICATION DOCUMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS application_documents (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL REFERENCES admission_applications(id) ON DELETE CASCADE,

  document_type TEXT NOT NULL,
  document_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,

  is_verified INTEGER DEFAULT 0,
  verified_by TEXT REFERENCES users(id),
  verified_at TEXT,
  verification_notes TEXT,

  uploaded_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 6. ADMISSION TESTS (Optional)
-- ============================================
CREATE TABLE IF NOT EXISTS admission_tests (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  test_name TEXT NOT NULL,
  test_date TEXT NOT NULL,
  test_time TEXT,
  duration_minutes INTEGER,
  venue TEXT,

  for_class_id TEXT REFERENCES classes(id),
  for_session_id TEXT REFERENCES academic_sessions(id),

  total_marks REAL,
  passing_marks REAL,

  instructions TEXT,

  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS application_test_results (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL REFERENCES admission_applications(id) ON DELETE CASCADE,
  test_id TEXT REFERENCES admission_tests(id),

  test_date TEXT,
  marks_obtained REAL,
  total_marks REAL,
  percentage REAL,
  result TEXT CHECK(result IN ('pass', 'fail', 'absent')),

  remarks TEXT,

  evaluated_by TEXT REFERENCES users(id),
  evaluated_at TEXT,

  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 7. ADMISSION INTERVIEWS (Optional)
-- ============================================
CREATE TABLE IF NOT EXISTS admission_interviews (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL REFERENCES admission_applications(id) ON DELETE CASCADE,

  interview_date TEXT NOT NULL,
  interview_time TEXT,
  venue TEXT,

  interviewer_id TEXT REFERENCES users(id),
  panel_members TEXT,

  status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'completed', 'cancelled', 'rescheduled')),

  -- Interview Assessment
  communication_rating INTEGER CHECK(communication_rating BETWEEN 1 AND 5),
  knowledge_rating INTEGER CHECK(knowledge_rating BETWEEN 1 AND 5),
  behavior_rating INTEGER CHECK(behavior_rating BETWEEN 1 AND 5),
  overall_rating INTEGER CHECK(overall_rating BETWEEN 1 AND 5),

  comments TEXT,
  recommendation TEXT CHECK(recommendation IN ('strongly_recommend', 'recommend', 'neutral', 'not_recommend', 'strongly_not_recommend')),

  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 8. ADMISSION DECISIONS
-- ============================================
CREATE TABLE IF NOT EXISTS admission_decisions (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL REFERENCES admission_applications(id) ON DELETE CASCADE,

  decision TEXT NOT NULL CHECK(decision IN ('approved', 'rejected', 'waitlisted', 'conditional')),
  decision_date TEXT DEFAULT (date('now')),

  -- Approved Details
  assigned_class_id TEXT REFERENCES classes(id),
  assigned_section_id TEXT REFERENCES sections(id),
  assigned_session_id TEXT REFERENCES academic_sessions(id),
  admission_date TEXT,

  -- Conditions (if conditional approval)
  conditions TEXT,

  -- Communication
  notification_sent INTEGER DEFAULT 0,
  notification_date TEXT,

  -- Response from Applicant
  applicant_response TEXT CHECK(applicant_response IN ('accepted', 'declined', 'pending')),
  response_date TEXT,

  decided_by TEXT REFERENCES users(id),
  remarks TEXT,

  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 9. ADMISSION CAMPAIGNS (Marketing)
-- ============================================
CREATE TABLE IF NOT EXISTS admission_campaigns (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  campaign_name TEXT NOT NULL,
  campaign_type TEXT,

  start_date TEXT,
  end_date TEXT,

  target_audience TEXT,
  budget REAL,

  -- Results
  enquiries_generated INTEGER DEFAULT 0,
  applications_received INTEGER DEFAULT 0,
  admissions_confirmed INTEGER DEFAULT 0,

  status TEXT DEFAULT 'planned' CHECK(status IN ('planned', 'active', 'completed', 'cancelled')),

  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- SECTION 3: CORE SYSTEM
-- Core entities: Academic structure, Students, Parents, Staff
-- ============================================

-- System Settings (per institution)
CREATE TABLE IF NOT EXISTS system_settings (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  category TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(institution_id, key)
);

-- ============================================
-- ACADEMIC STRUCTURE
-- ============================================

-- Academic Sessions
CREATE TABLE IF NOT EXISTS academic_sessions (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_current INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Terms
CREATE TABLE IF NOT EXISTS terms (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES academic_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_current INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Classes
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id),
  name TEXT NOT NULL,
  numeric_name INTEGER,
  description TEXT,
  capacity INTEGER,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Sections
CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INTEGER,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Subjects
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id),
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  type TEXT DEFAULT 'theory',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Class Subjects (mapping)
CREATE TABLE IF NOT EXISTS class_subjects (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
  subject_id TEXT REFERENCES subjects(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES academic_sessions(id),
  UNIQUE(class_id, subject_id, session_id)
);

-- ============================================
-- STUDENTS
-- ============================================

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  admission_number TEXT UNIQUE NOT NULL,
  registration_number TEXT UNIQUE,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  date_of_birth TEXT,
  gender TEXT CHECK(gender IN ('male', 'female', 'other')),
  nationality TEXT DEFAULT 'Liberian',
  county TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  photo TEXT,
  blood_group TEXT,
  medical_info TEXT,
  previous_school TEXT,
  previous_class TEXT,
  admission_date TEXT,
  branch_id TEXT REFERENCES branches(id),
  class_id TEXT REFERENCES classes(id),
  section_id TEXT REFERENCES sections(id),
  session_id TEXT REFERENCES academic_sessions(id),
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'graduated', 'transferred', 'withdrawn', 'suspended', 'deceased')),
  user_id TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Student Documents
CREATE TABLE IF NOT EXISTS student_documents (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  original_name TEXT,
  uploaded_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- PARENTS & GUARDIANS
-- ============================================

CREATE TABLE IF NOT EXISTS parents (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  relationship TEXT CHECK(relationship IN ('father', 'mother', 'guardian', 'other')),
  phone TEXT,
  email TEXT,
  address TEXT,
  occupation TEXT,
  workplace TEXT,
  photo TEXT,
  is_emergency_contact INTEGER DEFAULT 0,
  user_id TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Student-Parent Mapping
CREATE TABLE IF NOT EXISTS student_parents (
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES parents(id) ON DELETE CASCADE,
  is_primary INTEGER DEFAULT 0,
  PRIMARY KEY (student_id, parent_id)
);

-- ============================================
-- EMPLOYEES & STAFF
-- ============================================

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id),
  name TEXT NOT NULL,
  description TEXT,
  head_id TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Designations
CREATE TABLE IF NOT EXISTS designations (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Employees
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  employee_id TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  gender TEXT CHECK(gender IN ('male', 'female', 'other')),
  date_of_birth TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  photo TEXT,
  department_id TEXT REFERENCES departments(id),
  designation_id TEXT REFERENCES designations(id),
  branch_id TEXT REFERENCES branches(id),
  qualification TEXT,
  experience TEXT,
  employment_date TEXT,
  employment_type TEXT DEFAULT 'full-time' CHECK(employment_type IN ('full-time', 'part-time', 'contract', 'temporary')),
  basic_salary REAL DEFAULT 0,
  bank_name TEXT,
  bank_account TEXT,
  is_teacher INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  user_id TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Teacher Assignments
CREATE TABLE IF NOT EXISTS teacher_assignments (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES classes(id),
  section_id TEXT REFERENCES sections(id),
  subject_id TEXT REFERENCES subjects(id),
  session_id TEXT REFERENCES academic_sessions(id),
  is_class_teacher INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(employee_id, class_id, section_id, subject_id, session_id)
);

-- ============================================
-- SECTION 4: ACADEMIC OPERATIONS
-- Attendance, Timetable, Examinations, Marks, Results
-- ============================================

-- ============================================
-- ATTENDANCE
-- ============================================

-- Attendance Sessions
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES classes(id),
  section_id TEXT REFERENCES sections(id),
  subject_id TEXT REFERENCES subjects(id),
  session_id TEXT REFERENCES academic_sessions(id),
  term_id TEXT REFERENCES terms(id),
  teacher_id TEXT REFERENCES employees(id),
  date TEXT NOT NULL,
  type TEXT DEFAULT 'class' CHECK(type IN ('class', 'subject')),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Student Attendance
CREATE TABLE IF NOT EXISTS student_attendance (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  attendance_session_id TEXT REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES students(id),
  status TEXT NOT NULL CHECK(status IN ('present', 'absent', 'late', 'excused')),
  remarks TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- TIMETABLE
-- ============================================

-- Timetable Periods
CREATE TABLE IF NOT EXISTS timetable_periods (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id),
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  is_break INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Timetable Entries
CREATE TABLE IF NOT EXISTS timetable_entries (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES classes(id),
  section_id TEXT REFERENCES sections(id),
  subject_id TEXT REFERENCES subjects(id),
  teacher_id TEXT REFERENCES employees(id),
  period_id TEXT REFERENCES timetable_periods(id),
  session_id TEXT REFERENCES academic_sessions(id),
  day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
  room TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(class_id, section_id, period_id, day_of_week, session_id)
);

-- ============================================
-- EXAMINATIONS
-- ============================================

-- Exam Types
CREATE TABLE IF NOT EXISTS exam_types (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  percentage REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Exams
CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  exam_type_id TEXT REFERENCES exam_types(id),
  session_id TEXT REFERENCES academic_sessions(id),
  term_id TEXT REFERENCES terms(id),
  start_date TEXT,
  end_date TEXT,
  status TEXT DEFAULT 'upcoming' CHECK(status IN ('upcoming', 'ongoing', 'completed', 'cancelled')),
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Exam Schedules
CREATE TABLE IF NOT EXISTS exam_schedules (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  exam_id TEXT REFERENCES exams(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES classes(id),
  section_id TEXT REFERENCES sections(id),
  subject_id TEXT REFERENCES subjects(id),
  date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  room TEXT,
  max_marks REAL DEFAULT 100,
  pass_marks REAL DEFAULT 40,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Grade Scales
CREATE TABLE IF NOT EXISTS grade_scales (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Grade Scale Entries
CREATE TABLE IF NOT EXISTS grade_scale_entries (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  grade_scale_id TEXT REFERENCES grade_scales(id) ON DELETE CASCADE,
  grade TEXT NOT NULL,
  min_percentage REAL NOT NULL,
  max_percentage REAL NOT NULL,
  grade_point REAL DEFAULT 0,
  remark TEXT,
  sort_order INTEGER DEFAULT 0
);

-- Marks
CREATE TABLE IF NOT EXISTS marks (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  exam_schedule_id TEXT REFERENCES exam_schedules(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES students(id),
  marks_obtained REAL,
  is_absent INTEGER DEFAULT 0,
  remarks TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(exam_schedule_id, student_id)
);

-- Results
CREATE TABLE IF NOT EXISTS results (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES students(id),
  exam_id TEXT REFERENCES exams(id),
  class_id TEXT REFERENCES classes(id),
  section_id TEXT REFERENCES sections(id),
  session_id TEXT REFERENCES academic_sessions(id),
  term_id TEXT REFERENCES terms(id),
  total_marks REAL DEFAULT 0,
  total_obtained REAL DEFAULT 0,
  percentage REAL DEFAULT 0,
  grade TEXT,
  grade_point REAL DEFAULT 0,
  rank INTEGER,
  status TEXT DEFAULT 'pass' CHECK(status IN ('pass', 'fail', 'withheld')),
  teacher_comment TEXT,
  principal_comment TEXT,
  is_published INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(student_id, exam_id)
);

-- ============================================
-- SECTION 5: FINANCE
-- Fees, Payments, Income, Expenses
-- ============================================

-- ============================================
-- FEE MANAGEMENT
-- ============================================

-- Fee Types
CREATE TABLE IF NOT EXISTS fee_types (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  is_recurring INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Fee Structures
CREATE TABLE IF NOT EXISTS fee_structures (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  fee_type_id TEXT REFERENCES fee_types(id),
  session_id TEXT REFERENCES academic_sessions(id),
  term_id TEXT REFERENCES terms(id),
  branch_id TEXT REFERENCES branches(id),
  class_id TEXT REFERENCES classes(id),
  amount REAL NOT NULL DEFAULT 0,
  due_date TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Student Fee Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  invoice_number TEXT UNIQUE NOT NULL,
  student_id TEXT REFERENCES students(id),
  session_id TEXT REFERENCES academic_sessions(id),
  term_id TEXT REFERENCES terms(id),
  total_amount REAL NOT NULL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  paid_amount REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  status TEXT DEFAULT 'unpaid' CHECK(status IN ('unpaid', 'partial', 'paid', 'overdue', 'cancelled')),
  due_date TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Invoice Line Items
CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE CASCADE,
  fee_type_id TEXT REFERENCES fee_types(id),
  description TEXT,
  amount REAL NOT NULL DEFAULT 0,
  discount REAL DEFAULT 0,
  net_amount REAL NOT NULL DEFAULT 0
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  payment_number TEXT UNIQUE NOT NULL,
  invoice_id TEXT REFERENCES invoices(id),
  student_id TEXT REFERENCES students(id),
  amount REAL NOT NULL,
  payment_method TEXT DEFAULT 'cash' CHECK(payment_method IN ('cash', 'bank', 'mobile_money', 'card', 'cheque', 'other')),
  payment_date TEXT NOT NULL,
  reference_number TEXT,
  received_by TEXT REFERENCES users(id),
  notes TEXT,
  status TEXT DEFAULT 'completed' CHECK(status IN ('completed', 'pending', 'refunded', 'cancelled')),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Discounts
CREATE TABLE IF NOT EXISTS fee_discounts (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'percentage' CHECK(type IN ('percentage', 'fixed')),
  value REAL NOT NULL DEFAULT 0,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Student Discounts
CREATE TABLE IF NOT EXISTS student_discounts (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES students(id),
  discount_id TEXT REFERENCES fee_discounts(id),
  session_id TEXT REFERENCES academic_sessions(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(student_id, discount_id, session_id)
);

-- ============================================
-- INCOME & EXPENSES
-- ============================================

-- Income Categories
CREATE TABLE IF NOT EXISTS income_categories (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Income
CREATE TABLE IF NOT EXISTS income (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES income_categories(id),
  branch_id TEXT REFERENCES branches(id),
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  description TEXT,
  reference TEXT,
  payment_method TEXT DEFAULT 'cash',
  received_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Expense Categories
CREATE TABLE IF NOT EXISTS expense_categories (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES expense_categories(id),
  branch_id TEXT REFERENCES branches(id),
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  description TEXT,
  reference TEXT,
  vendor TEXT,
  payment_method TEXT DEFAULT 'cash',
  approved_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- SECTION 6: OPERATIONS (Library, Inventory, Transport)
-- ============================================

-- ============================================
-- LIBRARY MANAGEMENT
-- ============================================

-- Book Categories
CREATE TABLE IF NOT EXISTS book_categories (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Books
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  isbn TEXT,
  author TEXT,
  publisher TEXT,
  category_id TEXT REFERENCES book_categories(id),
  branch_id TEXT REFERENCES branches(id),
  edition TEXT,
  year INTEGER,
  quantity INTEGER DEFAULT 1,
  available INTEGER DEFAULT 1,
  rack_number TEXT,
  price REAL DEFAULT 0,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Book Issues
CREATE TABLE IF NOT EXISTS book_issues (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  book_id TEXT REFERENCES books(id),
  issued_to TEXT NOT NULL,
  issued_to_type TEXT DEFAULT 'student' CHECK(issued_to_type IN ('student', 'employee')),
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  return_date TEXT,
  status TEXT DEFAULT 'issued' CHECK(status IN ('issued', 'returned', 'lost', 'damaged')),
  fine_amount REAL DEFAULT 0,
  issued_by TEXT REFERENCES users(id),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- INVENTORY MANAGEMENT
-- ============================================

-- Inventory Categories
CREATE TABLE IF NOT EXISTS inventory_categories (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Inventory Items
CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES inventory_categories(id),
  branch_id TEXT REFERENCES branches(id),
  sku TEXT,
  quantity INTEGER DEFAULT 0,
  min_quantity INTEGER DEFAULT 0,
  unit TEXT DEFAULT 'piece',
  unit_price REAL DEFAULT 0,
  location TEXT,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Stock Transactions
CREATE TABLE IF NOT EXISTS stock_transactions (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES inventory_items(id),
  type TEXT NOT NULL CHECK(type IN ('purchase', 'issue', 'return', 'adjustment')),
  quantity INTEGER NOT NULL,
  unit_price REAL DEFAULT 0,
  total_price REAL DEFAULT 0,
  reference TEXT,
  vendor TEXT,
  date TEXT NOT NULL,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- TRANSPORT MANAGEMENT
-- ============================================

-- Vehicles
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  vehicle_number TEXT NOT NULL,
  model TEXT,
  driver_name TEXT,
  driver_phone TEXT,
  driver_license TEXT,
  capacity INTEGER DEFAULT 0,
  branch_id TEXT REFERENCES branches(id),
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'maintenance', 'inactive')),
  insurance_expiry TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Transport Routes
CREATE TABLE IF NOT EXISTS transport_routes (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  vehicle_id TEXT REFERENCES vehicles(id),
  branch_id TEXT REFERENCES branches(id),
  fare REAL DEFAULT 0,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Route Stops
CREATE TABLE IF NOT EXISTS route_stops (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  route_id TEXT REFERENCES transport_routes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pickup_time TEXT,
  drop_time TEXT,
  sort_order INTEGER DEFAULT 0
);

-- Student Transport
CREATE TABLE IF NOT EXISTS student_transport (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES students(id),
  route_id TEXT REFERENCES transport_routes(id),
  stop_id TEXT REFERENCES route_stops(id),
  session_id TEXT REFERENCES academic_sessions(id),
  pickup INTEGER DEFAULT 1,
  dropoff INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(student_id, session_id)
);

-- ============================================
-- RECEPTION & FRONT DESK
-- ============================================

-- Visitors
CREATE TABLE IF NOT EXISTS visitors (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  purpose TEXT,
  to_meet TEXT,
  id_type TEXT,
  id_number TEXT,
  branch_id TEXT REFERENCES branches(id),
  check_in TEXT NOT NULL,
  check_out TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Phone Calls
CREATE TABLE IF NOT EXISTS phone_calls (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  call_type TEXT DEFAULT 'incoming' CHECK(call_type IN ('incoming', 'outgoing')),
  caller_name TEXT,
  phone TEXT,
  purpose TEXT,
  date TEXT NOT NULL,
  duration TEXT,
  follow_up INTEGER DEFAULT 0,
  notes TEXT,
  branch_id TEXT REFERENCES branches(id),
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Postal/Courier Records
CREATE TABLE IF NOT EXISTS postal_records (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'incoming' CHECK(type IN ('incoming', 'outgoing')),
  reference_number TEXT,
  from_to TEXT,
  date TEXT NOT NULL,
  description TEXT,
  branch_id TEXT REFERENCES branches(id),
  received_by TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- CERTIFICATES & ID CARDS
-- ============================================

-- Certificate Templates
CREATE TABLE IF NOT EXISTS certificate_templates (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'custom' CHECK(type IN ('transfer', 'character', 'bonafide', 'completion', 'custom')),
  content TEXT NOT NULL,
  header TEXT,
  footer TEXT,
  background_image TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Generated Certificates
CREATE TABLE IF NOT EXISTS certificates (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  template_id TEXT REFERENCES certificate_templates(id),
  student_id TEXT REFERENCES students(id),
  certificate_number TEXT UNIQUE NOT NULL,
  issued_date TEXT NOT NULL,
  content TEXT,
  generated_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- ID Card Templates
CREATE TABLE IF NOT EXISTS id_card_templates (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'student' CHECK(type IN ('student', 'employee')),
  layout TEXT NOT NULL,
  background_color TEXT DEFAULT '#ffffff',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- SECTION 7: HR & PAYROLL
-- Salary, Payroll, Leave Management
-- ============================================

-- ============================================
-- SALARY STRUCTURES
-- ============================================

-- Salary Structures
CREATE TABLE IF NOT EXISTS salary_structures (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Salary Components (earnings & deductions)
CREATE TABLE IF NOT EXISTS salary_components (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  structure_id TEXT REFERENCES salary_structures(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('earning', 'deduction')),
  calculation_type TEXT DEFAULT 'fixed' CHECK(calculation_type IN ('fixed', 'percentage')),
  amount REAL DEFAULT 0,
  percentage_of TEXT,
  is_taxable INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0
);

-- Employee Salary Assignments
CREATE TABLE IF NOT EXISTS employee_salaries (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  employee_id TEXT REFERENCES employees(id),
  structure_id TEXT REFERENCES salary_structures(id),
  basic_salary REAL NOT NULL DEFAULT 0,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(employee_id, is_active)
);

-- ============================================
-- PAYROLL
-- ============================================

-- Payroll Runs
CREATE TABLE IF NOT EXISTS payroll_runs (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  branch_id TEXT REFERENCES branches(id),
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'processing', 'completed', 'cancelled')),
  total_earnings REAL DEFAULT 0,
  total_deductions REAL DEFAULT 0,
  total_net REAL DEFAULT 0,
  employee_count INTEGER DEFAULT 0,
  processed_by TEXT REFERENCES users(id),
  processed_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Payslips
CREATE TABLE IF NOT EXISTS payslips (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  payroll_id TEXT REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id TEXT REFERENCES employees(id),
  basic_salary REAL DEFAULT 0,
  total_earnings REAL DEFAULT 0,
  total_deductions REAL DEFAULT 0,
  net_salary REAL DEFAULT 0,
  status TEXT DEFAULT 'generated' CHECK(status IN ('generated', 'paid', 'cancelled')),
  payment_method TEXT DEFAULT 'bank_transfer',
  payment_date TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Payslip Items (breakdown)
CREATE TABLE IF NOT EXISTS payslip_items (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  payslip_id TEXT REFERENCES payslips(id) ON DELETE CASCADE,
  component_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('earning', 'deduction')),
  amount REAL NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

-- ============================================
-- LEAVE MANAGEMENT
-- ============================================

-- Leave Types
CREATE TABLE IF NOT EXISTS leave_types (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  days_allowed INTEGER DEFAULT 0,
  is_paid INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Leave Applications
CREATE TABLE IF NOT EXISTS leave_applications (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  employee_id TEXT REFERENCES employees(id),
  leave_type_id TEXT REFERENCES leave_types(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days INTEGER NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- LOANS & ADVANCES
-- ============================================

-- Employee Loans/Advances
CREATE TABLE IF NOT EXISTS employee_loans (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  employee_id TEXT REFERENCES employees(id),
  amount REAL NOT NULL,
  monthly_deduction REAL NOT NULL,
  total_paid REAL DEFAULT 0,
  balance REAL NOT NULL,
  start_date TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
  reason TEXT,
  approved_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- SECTION 8: COMMUNICATION
-- SMS, Email, Announcements, Notifications
-- ============================================

-- ============================================
-- SMS MESSAGING
-- ============================================

-- SMS Messages
CREATE TABLE IF NOT EXISTS sms_messages (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  sender_id TEXT REFERENCES users(id),
  recipient_type TEXT NOT NULL CHECK(recipient_type IN ('individual', 'group', 'class', 'all_students', 'all_parents', 'all_staff')),
  recipient_group_id TEXT,
  phone_numbers TEXT,
  message TEXT NOT NULL,
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'queued', 'sending', 'sent', 'failed')),
  scheduled_at TEXT,
  sent_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- SMS Recipients (individual tracking)
CREATE TABLE IF NOT EXISTS sms_recipients (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES sms_messages(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  recipient_name TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'delivered', 'failed')),
  sent_at TEXT,
  error_message TEXT
);

-- ============================================
-- EMAIL MESSAGING
-- ============================================

-- Email Messages
CREATE TABLE IF NOT EXISTS email_messages (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  sender_id TEXT REFERENCES users(id),
  recipient_type TEXT NOT NULL CHECK(recipient_type IN ('individual', 'group', 'class', 'all_students', 'all_parents', 'all_staff')),
  recipient_group_id TEXT,
  email_addresses TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  is_html INTEGER DEFAULT 0,
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'queued', 'sending', 'sent', 'failed')),
  scheduled_at TEXT,
  sent_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Email Recipients
CREATE TABLE IF NOT EXISTS email_recipients (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES email_messages(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  recipient_name TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
  sent_at TEXT,
  error_message TEXT
);

-- ============================================
-- ANNOUNCEMENTS
-- ============================================

-- Announcements / Notices
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'general' CHECK(type IN ('general', 'academic', 'event', 'emergency', 'holiday', 'exam')),
  priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
  audience TEXT DEFAULT 'all' CHECK(audience IN ('all', 'students', 'parents', 'staff', 'teachers', 'class')),
  audience_id TEXT,
  attachment TEXT,
  is_published INTEGER DEFAULT 0,
  published_at TEXT,
  expires_at TEXT,
  created_by TEXT REFERENCES users(id),
  branch_id TEXT REFERENCES branches(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- NOTIFICATION TEMPLATES
-- ============================================

-- Notification Templates
CREATE TABLE IF NOT EXISTS notification_templates (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('sms', 'email', 'both')),
  event TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  variables TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- COMMUNICATION LOG
-- ============================================

-- Communication Log (unified log for audit)
CREATE TABLE IF NOT EXISTS communication_log (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK(channel IN ('sms', 'email', 'notification')),
  reference_id TEXT,
  sender_id TEXT REFERENCES users(id),
  recipient TEXT,
  recipient_name TEXT,
  subject TEXT,
  content TEXT,
  status TEXT DEFAULT 'sent',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- SECTION 9: REPORTS & ANALYTICS
-- Report templates, system settings, custom fields
-- ============================================

-- ============================================
-- REPORTS
-- ============================================

-- Reports Configuration
CREATE TABLE IF NOT EXISTS report_templates (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('student', 'financial', 'academic', 'attendance', 'staff', 'custom')),
  description TEXT,
  query_template TEXT,
  parameters TEXT,
  format TEXT DEFAULT 'pdf' CHECK(format IN ('pdf', 'excel', 'csv')),
  is_active INTEGER DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Generated Reports Log
CREATE TABLE IF NOT EXISTS report_logs (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  template_id TEXT REFERENCES report_templates(id),
  generated_by TEXT REFERENCES users(id),
  parameters TEXT,
  file_path TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'generating', 'completed', 'failed')),
  generated_at TEXT DEFAULT (datetime('now')),
  download_count INTEGER DEFAULT 0
);

-- ============================================
-- SYSTEM BACKUPS
-- ============================================

-- System Backups
CREATE TABLE IF NOT EXISTS system_backups (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('full', 'database', 'files')),
  file_path TEXT NOT NULL,
  file_size INTEGER,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'failed')),
  initiated_by TEXT REFERENCES users(id),
  completed_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- DASHBOARD & ANALYTICS
-- ============================================

-- Activity Dashboard Stats (cached)
CREATE TABLE IF NOT EXISTS dashboard_stats (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  stat_key TEXT NOT NULL,
  stat_value TEXT NOT NULL,
  category TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(institution_id, stat_key)
);

-- ============================================
-- CUSTOM FIELDS (Extensibility)
-- ============================================

-- Custom Fields
CREATE TABLE IF NOT EXISTS custom_fields (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('student', 'teacher', 'parent', 'class', 'subject')),
  field_name TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK(field_type IN ('text', 'number', 'date', 'dropdown', 'checkbox', 'textarea')),
  field_options TEXT,
  is_required INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(institution_id, entity_type, field_name)
);

-- Custom Field Values
CREATE TABLE IF NOT EXISTS custom_field_values (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  field_id TEXT REFERENCES custom_fields(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  field_value TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(field_id, entity_id)
);

-- ============================================
-- SYSTEM SETTINGS
-- ============================================

-- System Settings (key-value store - platform level)
CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT,
  setting_type TEXT DEFAULT 'string' CHECK(setting_type IN ('string', 'number', 'boolean', 'json')),
  category TEXT DEFAULT 'general',
  description TEXT,
  is_public INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- BULK OPERATIONS
-- ============================================

-- Bulk Operations Log
CREATE TABLE IF NOT EXISTS bulk_operations (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  operation_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  total_records INTEGER DEFAULT 0,
  processed_records INTEGER DEFAULT 0,
  failed_records INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  initiated_by TEXT REFERENCES users(id),
  file_path TEXT,
  error_log TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

-- ============================================
-- PERFORMANCE METRICS
-- ============================================

-- Performance Metrics
CREATE TABLE IF NOT EXISTS performance_metrics (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL,
  metric_unit TEXT,
  recorded_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- SECTION 10: LICENSING & DEMO MODE
-- License management, activation, and demo mode tracking
-- ============================================

-- ============================================
-- LICENSES
-- ============================================
CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  -- License Key & Identification
  license_key TEXT UNIQUE NOT NULL,

  -- License Mode
  mode TEXT NOT NULL DEFAULT 'demo' CHECK(mode IN ('demo', 'production')),

  -- License Tier
  plan_tier TEXT NOT NULL CHECK(plan_tier IN ('free', 'basic', 'standard', 'premium', 'enterprise')),

  -- License Validity
  expiry_date TEXT NOT NULL,

  -- Machine Binding (optional - for production licenses)
  machine_fingerprint TEXT,

  -- License Status
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'revoked', 'expired')),

  -- Activation Tracking
  activated_at TEXT,

  -- Audit
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- LICENSE ACTIVATIONS
-- Track machine-specific activations and check-ins
-- ============================================
CREATE TABLE IF NOT EXISTS license_activations (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,

  -- Machine Identification
  machine_id TEXT NOT NULL,

  -- Activation Tracking
  activated_at TEXT NOT NULL,
  last_check_in TEXT,

  -- Network Information
  ip_address TEXT,

  -- Audit
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  UNIQUE(license_id, machine_id)
);

-- ============================================
-- DEMO MODE SETTINGS
-- Track demo mode usage per institution
-- ============================================
CREATE TABLE IF NOT EXISTS demo_mode_settings (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL UNIQUE REFERENCES institutions(id) ON DELETE CASCADE,

  -- Demo Limits
  max_students INTEGER DEFAULT 50,

  -- Demo Validity
  expiry_date TEXT NOT NULL,

  -- Audit
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- INDEXES for Licensing
-- ============================================
CREATE INDEX IF NOT EXISTS idx_licenses_institution ON licenses(institution_id);
CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_expiry ON licenses(expiry_date);
CREATE INDEX IF NOT EXISTS idx_licenses_mode ON licenses(mode);

CREATE INDEX IF NOT EXISTS idx_license_activations_institution ON license_activations(institution_id);
CREATE INDEX IF NOT EXISTS idx_license_activations_license ON license_activations(license_id);
CREATE INDEX IF NOT EXISTS idx_license_activations_machine ON license_activations(machine_id);

CREATE INDEX IF NOT EXISTS idx_demo_mode_settings_institution ON demo_mode_settings(institution_id);

-- ============================================
-- INDEXES
-- Comprehensive indexes for optimal query performance
-- ============================================

-- Section 1: Multi-tenant Foundation
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
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);

CREATE INDEX IF NOT EXISTS idx_institution_settings_key ON institution_settings(institution_id, setting_key);

CREATE INDEX IF NOT EXISTS idx_audit_logs_institution ON audit_logs(institution_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module);

-- Section 2: Admission Module
CREATE INDEX IF NOT EXISTS idx_enquiries_institution ON admission_enquiries(institution_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON admission_enquiries(status);
CREATE INDEX IF NOT EXISTS idx_enquiries_date ON admission_enquiries(enquiry_date);
CREATE INDEX IF NOT EXISTS idx_enquiries_assigned ON admission_enquiries(assigned_to);

CREATE INDEX IF NOT EXISTS idx_enquiry_followups_institution ON enquiry_followups(institution_id);
CREATE INDEX IF NOT EXISTS idx_enquiry_followups_enquiry ON enquiry_followups(enquiry_id);

CREATE INDEX IF NOT EXISTS idx_applications_institution ON admission_applications(institution_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON admission_applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_date ON admission_applications(application_date);
CREATE INDEX IF NOT EXISTS idx_applications_enquiry ON admission_applications(enquiry_id);

CREATE INDEX IF NOT EXISTS idx_app_parents_institution ON application_parents(institution_id);
CREATE INDEX IF NOT EXISTS idx_app_parents_application ON application_parents(application_id);

CREATE INDEX IF NOT EXISTS idx_app_documents_institution ON application_documents(institution_id);
CREATE INDEX IF NOT EXISTS idx_app_documents_application ON application_documents(application_id);

CREATE INDEX IF NOT EXISTS idx_admission_tests_institution ON admission_tests(institution_id);

CREATE INDEX IF NOT EXISTS idx_test_results_institution ON application_test_results(institution_id);
CREATE INDEX IF NOT EXISTS idx_test_results_application ON application_test_results(application_id);

CREATE INDEX IF NOT EXISTS idx_interviews_institution ON admission_interviews(institution_id);
CREATE INDEX IF NOT EXISTS idx_interviews_application ON admission_interviews(application_id);

CREATE INDEX IF NOT EXISTS idx_decisions_institution ON admission_decisions(institution_id);
CREATE INDEX IF NOT EXISTS idx_decisions_application ON admission_decisions(application_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_institution ON admission_campaigns(institution_id);

-- Section 3: Core System
CREATE INDEX IF NOT EXISTS idx_system_settings_institution ON system_settings(institution_id);

CREATE INDEX IF NOT EXISTS idx_academic_sessions_institution ON academic_sessions(institution_id);

CREATE INDEX IF NOT EXISTS idx_terms_institution ON terms(institution_id);
CREATE INDEX IF NOT EXISTS idx_terms_session ON terms(session_id);

CREATE INDEX IF NOT EXISTS idx_classes_institution ON classes(institution_id);
CREATE INDEX IF NOT EXISTS idx_classes_branch ON classes(branch_id);

CREATE INDEX IF NOT EXISTS idx_sections_institution ON sections(institution_id);
CREATE INDEX IF NOT EXISTS idx_sections_class ON sections(class_id);

CREATE INDEX IF NOT EXISTS idx_subjects_institution ON subjects(institution_id);
CREATE INDEX IF NOT EXISTS idx_subjects_branch ON subjects(branch_id);

CREATE INDEX IF NOT EXISTS idx_class_subjects_institution ON class_subjects(institution_id);

CREATE INDEX IF NOT EXISTS idx_students_institution ON students(institution_id);
CREATE INDEX IF NOT EXISTS idx_students_branch ON students(branch_id);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_section ON students(section_id);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);

CREATE INDEX IF NOT EXISTS idx_student_documents_institution ON student_documents(institution_id);
CREATE INDEX IF NOT EXISTS idx_student_documents_student ON student_documents(student_id);

CREATE INDEX IF NOT EXISTS idx_parents_institution ON parents(institution_id);

CREATE INDEX IF NOT EXISTS idx_departments_institution ON departments(institution_id);
CREATE INDEX IF NOT EXISTS idx_departments_branch ON departments(branch_id);

CREATE INDEX IF NOT EXISTS idx_designations_institution ON designations(institution_id);

CREATE INDEX IF NOT EXISTS idx_employees_institution ON employees(institution_id);
CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);

CREATE INDEX IF NOT EXISTS idx_teacher_assignments_institution ON teacher_assignments(institution_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_employee ON teacher_assignments(employee_id);

-- Section 4: Academic Operations
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_institution ON attendance_sessions(institution_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_date ON attendance_sessions(date);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_class ON attendance_sessions(class_id);

CREATE INDEX IF NOT EXISTS idx_student_attendance_institution ON student_attendance(institution_id);
CREATE INDEX IF NOT EXISTS idx_student_attendance_student ON student_attendance(student_id);

CREATE INDEX IF NOT EXISTS idx_timetable_periods_institution ON timetable_periods(institution_id);

CREATE INDEX IF NOT EXISTS idx_timetable_entries_institution ON timetable_entries(institution_id);
CREATE INDEX IF NOT EXISTS idx_timetable_entries_class ON timetable_entries(class_id, section_id);

CREATE INDEX IF NOT EXISTS idx_exam_types_institution ON exam_types(institution_id);

CREATE INDEX IF NOT EXISTS idx_exams_institution ON exams(institution_id);

CREATE INDEX IF NOT EXISTS idx_exam_schedules_institution ON exam_schedules(institution_id);
CREATE INDEX IF NOT EXISTS idx_exam_schedules_exam ON exam_schedules(exam_id);

CREATE INDEX IF NOT EXISTS idx_grade_scales_institution ON grade_scales(institution_id);

CREATE INDEX IF NOT EXISTS idx_grade_scale_entries_institution ON grade_scale_entries(institution_id);

CREATE INDEX IF NOT EXISTS idx_marks_institution ON marks(institution_id);
CREATE INDEX IF NOT EXISTS idx_marks_student ON marks(student_id);
CREATE INDEX IF NOT EXISTS idx_marks_schedule ON marks(exam_schedule_id);

CREATE INDEX IF NOT EXISTS idx_results_institution ON results(institution_id);
CREATE INDEX IF NOT EXISTS idx_results_student ON results(student_id);
CREATE INDEX IF NOT EXISTS idx_results_exam ON results(exam_id);

-- Section 5: Finance
CREATE INDEX IF NOT EXISTS idx_fee_types_institution ON fee_types(institution_id);

CREATE INDEX IF NOT EXISTS idx_fee_structures_institution ON fee_structures(institution_id);
CREATE INDEX IF NOT EXISTS idx_fee_structures_class ON fee_structures(class_id);
CREATE INDEX IF NOT EXISTS idx_fee_structures_session ON fee_structures(session_id);

CREATE INDEX IF NOT EXISTS idx_invoices_institution ON invoices(institution_id);
CREATE INDEX IF NOT EXISTS idx_invoices_student ON invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_session ON invoices(session_id);

CREATE INDEX IF NOT EXISTS idx_invoice_items_institution ON invoice_items(institution_id);

CREATE INDEX IF NOT EXISTS idx_payments_institution ON payments(institution_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);

CREATE INDEX IF NOT EXISTS idx_fee_discounts_institution ON fee_discounts(institution_id);

CREATE INDEX IF NOT EXISTS idx_student_discounts_institution ON student_discounts(institution_id);

CREATE INDEX IF NOT EXISTS idx_income_categories_institution ON income_categories(institution_id);

CREATE INDEX IF NOT EXISTS idx_income_institution ON income(institution_id);
CREATE INDEX IF NOT EXISTS idx_income_date ON income(date);
CREATE INDEX IF NOT EXISTS idx_income_category ON income(category_id);

CREATE INDEX IF NOT EXISTS idx_expense_categories_institution ON expense_categories(institution_id);

CREATE INDEX IF NOT EXISTS idx_expenses_institution ON expenses(institution_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);

-- Section 6: Operations
CREATE INDEX IF NOT EXISTS idx_book_categories_institution ON book_categories(institution_id);

CREATE INDEX IF NOT EXISTS idx_books_institution ON books(institution_id);
CREATE INDEX IF NOT EXISTS idx_books_category ON books(category_id);
CREATE INDEX IF NOT EXISTS idx_books_branch ON books(branch_id);

CREATE INDEX IF NOT EXISTS idx_book_issues_institution ON book_issues(institution_id);
CREATE INDEX IF NOT EXISTS idx_book_issues_book ON book_issues(book_id);
CREATE INDEX IF NOT EXISTS idx_book_issues_status ON book_issues(status);

CREATE INDEX IF NOT EXISTS idx_inventory_categories_institution ON inventory_categories(institution_id);

CREATE INDEX IF NOT EXISTS idx_inventory_items_institution ON inventory_items(institution_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(category_id);

CREATE INDEX IF NOT EXISTS idx_stock_transactions_institution ON stock_transactions(institution_id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_item ON stock_transactions(item_id);

CREATE INDEX IF NOT EXISTS idx_vehicles_institution ON vehicles(institution_id);

CREATE INDEX IF NOT EXISTS idx_transport_routes_institution ON transport_routes(institution_id);
CREATE INDEX IF NOT EXISTS idx_transport_routes_vehicle ON transport_routes(vehicle_id);

CREATE INDEX IF NOT EXISTS idx_route_stops_institution ON route_stops(institution_id);

CREATE INDEX IF NOT EXISTS idx_student_transport_institution ON student_transport(institution_id);
CREATE INDEX IF NOT EXISTS idx_student_transport_student ON student_transport(student_id);

CREATE INDEX IF NOT EXISTS idx_visitors_institution ON visitors(institution_id);
CREATE INDEX IF NOT EXISTS idx_visitors_branch ON visitors(branch_id);

CREATE INDEX IF NOT EXISTS idx_phone_calls_institution ON phone_calls(institution_id);

CREATE INDEX IF NOT EXISTS idx_postal_records_institution ON postal_records(institution_id);

CREATE INDEX IF NOT EXISTS idx_certificate_templates_institution ON certificate_templates(institution_id);

CREATE INDEX IF NOT EXISTS idx_certificates_institution ON certificates(institution_id);
CREATE INDEX IF NOT EXISTS idx_certificates_student ON certificates(student_id);

CREATE INDEX IF NOT EXISTS idx_id_card_templates_institution ON id_card_templates(institution_id);

-- Section 7: HR & Payroll
CREATE INDEX IF NOT EXISTS idx_salary_structures_institution ON salary_structures(institution_id);

CREATE INDEX IF NOT EXISTS idx_salary_components_institution ON salary_components(institution_id);

CREATE INDEX IF NOT EXISTS idx_employee_salaries_institution ON employee_salaries(institution_id);
CREATE INDEX IF NOT EXISTS idx_employee_salaries_employee ON employee_salaries(employee_id);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_institution ON payroll_runs(institution_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_month ON payroll_runs(month, year);

CREATE INDEX IF NOT EXISTS idx_payslips_institution ON payslips(institution_id);
CREATE INDEX IF NOT EXISTS idx_payslips_payroll ON payslips(payroll_id);
CREATE INDEX IF NOT EXISTS idx_payslips_employee ON payslips(employee_id);

CREATE INDEX IF NOT EXISTS idx_payslip_items_institution ON payslip_items(institution_id);

CREATE INDEX IF NOT EXISTS idx_leave_types_institution ON leave_types(institution_id);

CREATE INDEX IF NOT EXISTS idx_leave_applications_institution ON leave_applications(institution_id);
CREATE INDEX IF NOT EXISTS idx_leave_applications_employee ON leave_applications(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_applications_status ON leave_applications(status);

CREATE INDEX IF NOT EXISTS idx_employee_loans_institution ON employee_loans(institution_id);
CREATE INDEX IF NOT EXISTS idx_employee_loans_employee ON employee_loans(employee_id);

-- Section 8: Communication
CREATE INDEX IF NOT EXISTS idx_sms_messages_institution ON sms_messages(institution_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_status ON sms_messages(status);
CREATE INDEX IF NOT EXISTS idx_sms_messages_sender ON sms_messages(sender_id);

CREATE INDEX IF NOT EXISTS idx_sms_recipients_institution ON sms_recipients(institution_id);
CREATE INDEX IF NOT EXISTS idx_sms_recipients_message ON sms_recipients(message_id);

CREATE INDEX IF NOT EXISTS idx_email_messages_institution ON email_messages(institution_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_status ON email_messages(status);
CREATE INDEX IF NOT EXISTS idx_email_messages_sender ON email_messages(sender_id);

CREATE INDEX IF NOT EXISTS idx_email_recipients_institution ON email_recipients(institution_id);
CREATE INDEX IF NOT EXISTS idx_email_recipients_message ON email_recipients(message_id);

CREATE INDEX IF NOT EXISTS idx_announcements_institution ON announcements(institution_id);
CREATE INDEX IF NOT EXISTS idx_announcements_published ON announcements(is_published);
CREATE INDEX IF NOT EXISTS idx_announcements_type ON announcements(type);

CREATE INDEX IF NOT EXISTS idx_notification_templates_institution ON notification_templates(institution_id);

CREATE INDEX IF NOT EXISTS idx_communication_log_institution ON communication_log(institution_id);
CREATE INDEX IF NOT EXISTS idx_communication_log_channel ON communication_log(channel);
CREATE INDEX IF NOT EXISTS idx_communication_log_date ON communication_log(created_at);

-- Section 9: Reports & Analytics
CREATE INDEX IF NOT EXISTS idx_report_templates_institution ON report_templates(institution_id);

CREATE INDEX IF NOT EXISTS idx_report_logs_institution ON report_logs(institution_id);
CREATE INDEX IF NOT EXISTS idx_report_logs_generated ON report_logs(generated_at);

CREATE INDEX IF NOT EXISTS idx_backups_institution ON system_backups(institution_id);
CREATE INDEX IF NOT EXISTS idx_backups_created ON system_backups(created_at);

CREATE INDEX IF NOT EXISTS idx_dashboard_stats_institution ON dashboard_stats(institution_id);

CREATE INDEX IF NOT EXISTS idx_custom_fields_institution ON custom_fields(institution_id);

CREATE INDEX IF NOT EXISTS idx_custom_field_values_institution ON custom_field_values(institution_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_entity ON custom_field_values(entity_id);

CREATE INDEX IF NOT EXISTS idx_bulk_operations_institution ON bulk_operations(institution_id);
CREATE INDEX IF NOT EXISTS idx_bulk_operations_status ON bulk_operations(status);

CREATE INDEX IF NOT EXISTS idx_performance_metrics_institution ON performance_metrics(institution_id);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_name ON performance_metrics(metric_name);
`;
