import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { initializeDatabase, getDatabase } from './init';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database with V2 schema
initializeDatabase();
const db = getDatabase();

console.log('🌱 Starting multi-tenant seed...\n');

// ============================================
// 1. CREATE PLATFORM DATA
// ============================================

console.log('1️⃣  Creating platform-level data...');

// Create Platform Roles (no institution_id - these are global)
const platformAdminRoleId = uuidv4();
const institutionAdminRoleId = uuidv4();

const platformRoles = [
  {
    id: platformAdminRoleId,
    institution_id: null, // Platform role
    role_code: 'platform_admin',
    role_name: 'Platform Administrator',
    description: 'AfriMind Tech & AI Consulting Agency (AfriMind) - Manages all institutions',
    is_system_role: 1,
    is_platform_role: 1,
    role_level: 'platform',
    permissions: JSON.stringify(['*']), // All permissions
    is_active: 1,
  },
  {
    id: institutionAdminRoleId,
    institution_id: null, // Will be institution-specific when created
    role_code: 'institution_admin',
    role_name: 'Institution Administrator',
    description: 'Manages entire institution',
    is_system_role: 1,
    is_platform_role: 0,
    role_level: 'institution',
    permissions: JSON.stringify(['institution.*']),
    is_active: 1,
  },
];

// Insert platform roles
for (const role of platformRoles) {
  db.prepare(`
    INSERT INTO roles (id, institution_id, role_code, role_name, description, is_system_role, is_platform_role, role_level, permissions, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    role.id,
    role.institution_id,
    role.role_code,
    role.role_name,
    role.description,
    role.is_system_role,
    role.is_platform_role,
    role.role_level,
    role.permissions,
    role.is_active
  );
}

console.log('   ✓ Platform roles created');

// ============================================
// 2. CREATE DEMO INSTITUTION
// ============================================

console.log('\n2️⃣  Creating demo institution...');

const institutionId = uuidv4();
const mainBranchId = uuidv4();

const demoInstitution = {
  id: institutionId,
  institution_code: 'DEMO001',
  institution_name: 'Victory High School Liberia',
  institution_type: 'secondary',
  email: 'info@victoryhighschool.lr',
  phone: '+231-888-123456',
  mobile: '+231-777-123456',
  website: 'www.victoryhighschool.lr',
  address: '123 Education Street',
  county: 'Montserrado',
  city: 'Monrovia',
  postal_code: '1000',
  country: 'Liberia',
  logo: null,
  favicon: null,
  motto: 'Excellence Through Education',
  currency: 'USD',
  currency_symbol: '$',
  timezone: 'Africa/Monrovia',
  date_format: 'DD/MM/YYYY',
  time_format: '12h',
  language: 'en',
  academic_year_start_month: 9,
  academic_year_end_month: 7,
  student_id_format: 'VHS-{YEAR}-{SEQ}',
  employee_id_format: 'EMP-{YEAR}-{SEQ}',
  admission_number_format: 'ADM-{YEAR}-{SEQ}',
  invoice_number_format: 'INV-{YEAR}-{SEQ}',
  receipt_number_format: 'RCP-{YEAR}-{SEQ}',
  subscription_plan: 'trial',
  subscription_status: 'active',
  subscription_start_date: new Date().toISOString().split('T')[0],
  subscription_end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 90 days
  max_students: 1000,
  max_staff: 50,
  is_active: 1,
  setup_completed: 1,
  created_by: null,
};

db.prepare(`
  INSERT INTO institutions (
    id, institution_code, institution_name, institution_type,
    email, phone, mobile, website, address, county, city, postal_code, country,
    logo, favicon, motto, currency, currency_symbol, timezone,
    date_format, time_format, language,
    academic_year_start_month, academic_year_end_month,
    student_id_format, employee_id_format, admission_number_format,
    invoice_number_format, receipt_number_format,
    subscription_plan, subscription_status, subscription_start_date, subscription_end_date,
    max_students, max_staff, is_active, setup_completed, created_by
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
`).run(
  demoInstitution.id,
  demoInstitution.institution_code,
  demoInstitution.institution_name,
  demoInstitution.institution_type,
  demoInstitution.email,
  demoInstitution.phone,
  demoInstitution.mobile,
  demoInstitution.website,
  demoInstitution.address,
  demoInstitution.county,
  demoInstitution.city,
  demoInstitution.postal_code,
  demoInstitution.country,
  demoInstitution.logo,
  demoInstitution.favicon,
  demoInstitution.motto,
  demoInstitution.currency,
  demoInstitution.currency_symbol,
  demoInstitution.timezone,
  demoInstitution.date_format,
  demoInstitution.time_format,
  demoInstitution.language,
  demoInstitution.academic_year_start_month,
  demoInstitution.academic_year_end_month,
  demoInstitution.student_id_format,
  demoInstitution.employee_id_format,
  demoInstitution.admission_number_format,
  demoInstitution.invoice_number_format,
  demoInstitution.receipt_number_format,
  demoInstitution.subscription_plan,
  demoInstitution.subscription_status,
  demoInstitution.subscription_start_date,
  demoInstitution.subscription_end_date,
  demoInstitution.max_students,
  demoInstitution.max_staff,
  demoInstitution.is_active,
  demoInstitution.setup_completed,
  demoInstitution.created_by
);

console.log(`   ✓ Institution created: ${demoInstitution.institution_name} (${demoInstitution.institution_code})`);

// Create Main Branch
db.prepare(`
  INSERT INTO branches (id, institution_id, branch_code, branch_name, email, phone, address, county, city, is_main, is_active, student_capacity, staff_capacity)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  mainBranchId,
  institutionId,
  'MAIN',
  'Main Campus',
  'main@victoryhighschool.lr',
  '+231-888-123456',
  '123 Education Street',
  'Montserrado',
  'Monrovia',
  1,
  1,
  800,
  40
);

console.log('   ✓ Main branch created');

// ============================================
// 3. CREATE INSTITUTION-SPECIFIC ROLES
// ============================================

console.log('\n3️⃣  Creating institution-specific roles...');

const principalRoleId = uuidv4();
const teacherRoleId = uuidv4();
const accountantRoleId = uuidv4();

const institutionRoles = [
  {
    id: principalRoleId,
    institution_id: institutionId,
    role_code: 'principal',
    role_name: 'Principal',
    description: 'Academic and administrative oversight',
    is_system_role: 1,
    is_platform_role: 0,
    role_level: 'institution',
    permissions: JSON.stringify(['students.*', 'teachers.*', 'academics.*', 'attendance.*', 'exams.*']),
    is_active: 1,
  },
  {
    id: teacherRoleId,
    institution_id: institutionId,
    role_code: 'teacher',
    role_name: 'Teacher',
    description: 'Class management, attendance, marks',
    is_system_role: 1,
    is_platform_role: 0,
    role_level: 'branch',
    permissions: JSON.stringify(['students.view', 'attendance.manage', 'marks.manage']),
    is_active: 1,
  },
  {
    id: accountantRoleId,
    institution_id: institutionId,
    role_code: 'accountant',
    role_name: 'Accountant',
    description: 'Fees, payments, expenses',
    is_system_role: 1,
    is_platform_role: 0,
    role_level: 'institution',
    permissions: JSON.stringify(['fees.*', 'payments.*', 'expenses.*', 'reports.financial']),
    is_active: 1,
  },
];

for (const role of institutionRoles) {
  db.prepare(`
    INSERT INTO roles (id, institution_id, role_code, role_name, description, is_system_role, is_platform_role, role_level, permissions, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    role.id,
    role.institution_id,
    role.role_code,
    role.role_name,
    role.description,
    role.is_system_role,
    role.is_platform_role,
    role.role_level,
    role.permissions,
    role.is_active
  );
}

console.log('   ✓ Institution roles created (Principal, Teacher, Accountant)');

// ============================================
// 4. CREATE USERS
// ============================================

console.log('\n4️⃣  Creating users...');

const passwordHash = bcrypt.hashSync('admin123', 10);

const platformAdminId = uuidv4();
const institutionAdminId = uuidv4();

// Platform Super Admin (AfriMind)
db.prepare(`
  INSERT INTO users (
    id, institution_id, branch_id, username, email, password_hash,
    first_name, last_name, phone, avatar, role_id, user_type,
    linked_entity_type, linked_entity_id, is_active, email_verified
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  platformAdminId,
  null, // Platform admin - no institution
  null,
  'superadmin',
  'admin@softwarevala.com',
  passwordHash,
  'Platform',
  'Administrator',
  '+231-555-000000',
  null,
  platformAdminRoleId,
  'platform_admin',
  null,
  null,
  1,
  1
);

console.log('   ✓ Platform super admin created (superadmin / admin123)');

// Institution Admin for Victory High School
db.prepare(`
  INSERT INTO users (
    id, institution_id, branch_id, username, email, password_hash,
    first_name, last_name, phone, avatar, role_id, user_type,
    linked_entity_type, linked_entity_id, is_active, email_verified
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  institutionAdminId,
  institutionId,
  mainBranchId,
  'admin',
  'admin@victoryhighschool.lr',
  passwordHash,
  'John',
  'Kamara',
  '+231-888-123456',
  null,
  institutionAdminRoleId,
  'institution_admin',
  null,
  null,
  1,
  1
);

console.log('   ✓ Institution admin created (admin / admin123)');

// ============================================
// 5. CREATE ACADEMIC STRUCTURE
// ============================================

console.log('\n5️⃣  Creating academic structure...');

const sessionId = uuidv4();
const currentYear = new Date().getFullYear();

// Academic Session
db.prepare(`
  INSERT INTO academic_sessions (id, institution_id, name, start_date, end_date, is_current)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(
  sessionId,
  institutionId,
  `${currentYear}/${currentYear + 1}`,
  `${currentYear}-09-01`,
  `${currentYear + 1}-07-31`,
  1
);

console.log(`   ✓ Academic session created: ${currentYear}/${currentYear + 1}`);

// Terms
const term1Id = uuidv4();
const term2Id = uuidv4();

db.prepare(`
  INSERT INTO terms (id, institution_id, session_id, name, start_date, end_date, is_current)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(term1Id, institutionId, sessionId, 'First Term', `${currentYear}-09-01`, `${currentYear}-12-15`, 1);

db.prepare(`
  INSERT INTO terms (id, institution_id, session_id, name, start_date, end_date, is_current)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(term2Id, institutionId, sessionId, 'Second Term', `${currentYear + 1}-01-05`, `${currentYear + 1}-04-15`, 0);

console.log('   ✓ Terms created');

// Classes (Grades 7-12)
const classes: any[] = [];
for (let grade = 7; grade <= 12; grade++) {
  const classId = uuidv4();
  db.prepare(`
    INSERT INTO classes (id, institution_id, branch_id, name, numeric_name, description, capacity, is_active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    classId,
    institutionId,
    mainBranchId,
    `Grade ${grade}`,
    grade,
    `${grade}${grade === 12 ? 'th' : 'th'} Grade Class`,
    60,
    1,
    grade
  );
  classes.push({ id: classId, name: `Grade ${grade}`, grade });
}

console.log('   ✓ Classes created (Grade 7-12)');

// Sections
for (const cls of classes) {
  const sectionAId = uuidv4();
  db.prepare(`
    INSERT INTO sections (id, institution_id, class_id, name, capacity, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sectionAId, institutionId, cls.id, 'Section A', 30, 1);
}

console.log('   ✓ Sections created');

// ============================================
// 6. SUMMARY
// ============================================

console.log('\n' + '='.repeat(60));
console.log('🎉 MULTI-TENANT SEED COMPLETE!');
console.log('='.repeat(60));
console.log('\n📊 Summary:');
console.log(`   • Platform: AfriMind Tech & AI Consulting Agency (AfriMind)`);
console.log(`   • Institutions: 1 (Victory High School)`);
console.log(`   • Branches: 1 (Main Campus)`);
console.log(`   • Users: 2`);
console.log(`   • Classes: 6 (Grades 7-12)`);
console.log(`   • Sections: 6`);
console.log(`   • Academic Year: ${currentYear}/${currentYear + 1}`);

console.log('\n🔐 Login Credentials:');
console.log('   ┌─────────────────────────────────────────────────┐');
console.log('   │ PLATFORM SUPER ADMIN                            │');
console.log('   │ Username: superadmin                            │');
console.log('   │ Password: admin123                              │');
console.log('   │ Access: ALL institutions                        │');
console.log('   ├─────────────────────────────────────────────────┤');
console.log('   │ INSTITUTION ADMIN (Victory High School)         │');
console.log('   │ Username: admin                                 │');
console.log('   │ Password: admin123                              │');
console.log('   │ Access: Victory High School only                │');
console.log('   └─────────────────────────────────────────────────┘');

console.log('\n✅ Ready for multi-tenant operation!\n');
