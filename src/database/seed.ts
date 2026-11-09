import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { initializeDatabase, getDatabase } from './init';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

initializeDatabase();
const db = getDatabase();

const roles = [
  { id: uuidv4(), name: 'super_admin', display_name: 'Super Administrator', description: 'Full system control', is_system: 1 },
  { id: uuidv4(), name: 'school_admin', display_name: 'School Administrator', description: 'School-level management', is_system: 1 },
  { id: uuidv4(), name: 'branch_admin', display_name: 'Branch Administrator', description: 'Branch-specific management', is_system: 0 },
  { id: uuidv4(), name: 'principal', display_name: 'Principal', description: 'Academic and administrative oversight', is_system: 0 },
  { id: uuidv4(), name: 'teacher', display_name: 'Teacher', description: 'Class management, attendance, marks', is_system: 0 },
  { id: uuidv4(), name: 'accountant', display_name: 'Accountant', description: 'Fees, payments, expenses', is_system: 0 },
  { id: uuidv4(), name: 'hr_manager', display_name: 'HR Manager', description: 'Staff and payroll management', is_system: 0 },
  { id: uuidv4(), name: 'librarian', display_name: 'Librarian', description: 'Library management', is_system: 0 },
  { id: uuidv4(), name: 'parent', display_name: 'Parent', description: 'View children information', is_system: 0 },
  { id: uuidv4(), name: 'student', display_name: 'Student', description: 'View own information', is_system: 0 },
];

const permissions = [
  // Dashboard
  { id: uuidv4(), name: 'dashboard.view', display_name: 'View Dashboard', module: 'dashboard' },
  // Students
  { id: uuidv4(), name: 'students.view', display_name: 'View Students', module: 'students' },
  { id: uuidv4(), name: 'students.create', display_name: 'Create Students', module: 'students' },
  { id: uuidv4(), name: 'students.edit', display_name: 'Edit Students', module: 'students' },
  { id: uuidv4(), name: 'students.delete', display_name: 'Delete Students', module: 'students' },
  // Parents
  { id: uuidv4(), name: 'parents.view', display_name: 'View Parents', module: 'parents' },
  { id: uuidv4(), name: 'parents.create', display_name: 'Create Parents', module: 'parents' },
  { id: uuidv4(), name: 'parents.edit', display_name: 'Edit Parents', module: 'parents' },
  // Teachers
  { id: uuidv4(), name: 'teachers.view', display_name: 'View Teachers', module: 'teachers' },
  { id: uuidv4(), name: 'teachers.create', display_name: 'Create Teachers', module: 'teachers' },
  { id: uuidv4(), name: 'teachers.edit', display_name: 'Edit Teachers', module: 'teachers' },
  { id: uuidv4(), name: 'teachers.delete', display_name: 'Delete Teachers', module: 'teachers' },
  // Academics
  { id: uuidv4(), name: 'academics.view', display_name: 'View Academics', module: 'academics' },
  { id: uuidv4(), name: 'academics.manage', display_name: 'Manage Academics', module: 'academics' },
  // Branches
  { id: uuidv4(), name: 'branches.view', display_name: 'View Branches', module: 'branches' },
  { id: uuidv4(), name: 'branches.manage', display_name: 'Manage Branches', module: 'branches' },
  // Settings
  { id: uuidv4(), name: 'settings.view', display_name: 'View Settings', module: 'settings' },
  { id: uuidv4(), name: 'settings.manage', display_name: 'Manage Settings', module: 'settings' },
  // Users
  { id: uuidv4(), name: 'users.view', display_name: 'View Users', module: 'users' },
  { id: uuidv4(), name: 'users.manage', display_name: 'Manage Users', module: 'users' },
];

console.log('Seeding roles...');
const insertRole = db.prepare('INSERT OR IGNORE INTO roles (id, name, display_name, description, is_system) VALUES (?, ?, ?, ?, ?)');
for (const role of roles) {
  insertRole.run(role.id, role.name, role.display_name, role.description, role.is_system);
}

console.log('Seeding permissions...');
const insertPerm = db.prepare('INSERT OR IGNORE INTO permissions (id, name, display_name, module) VALUES (?, ?, ?, ?)');
for (const perm of permissions) {
  insertPerm.run(perm.id, perm.name, perm.display_name, perm.module);
}

// Give super_admin all permissions
const superAdminRole = roles.find(r => r.name === 'super_admin')!;
const insertRolePerm = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
for (const perm of permissions) {
  insertRolePerm.run(superAdminRole.id, perm.id);
}

// Create institution
console.log('Seeding institution...');
const instId = uuidv4();
db.prepare(`
  INSERT OR IGNORE INTO institutions (id, name, code, country, currency, currency_symbol, timezone, motto)
  VALUES (?, 'AfriMind Academy', 'SVLA', 'Liberia', 'USD', '$', 'Africa/Monrovia', 'Manage. Educate. Automate.')
`).run(instId);

// Create main branch
console.log('Seeding branch...');
const branchId = uuidv4();
db.prepare(`
  INSERT OR IGNORE INTO branches (id, institution_id, name, code, is_main)
  VALUES (?, ?, 'Main Campus', 'MAIN', 1)
`).run(branchId, instId);

// Create default admin user
console.log('Seeding admin user...');
const adminId = uuidv4();
const passwordHash = bcrypt.hashSync('admin123', 10);
db.prepare(`
  INSERT OR IGNORE INTO users (id, username, email, password_hash, first_name, last_name, role_id, branch_id)
  VALUES (?, 'admin', 'admin@svl-sms.com', ?, 'System', 'Administrator', ?, ?)
`).run(adminId, passwordHash, superAdminRole.id, branchId);

// Create academic session
console.log('Seeding academic session...');
const sessionId = uuidv4();
db.prepare(`
  INSERT OR IGNORE INTO academic_sessions (id, institution_id, name, start_date, end_date, is_current)
  VALUES (?, ?, '2026/2027', '2026-09-01', '2027-07-31', 1)
`).run(sessionId, instId);

// Create terms
const terms = [
  { name: 'Term 1', start: '2026-09-01', end: '2026-12-15' },
  { name: 'Term 2', start: '2027-01-10', end: '2027-04-15' },
  { name: 'Term 3', start: '2027-04-28', end: '2027-07-31' },
];
const insertTerm = db.prepare('INSERT OR IGNORE INTO terms (id, session_id, name, start_date, end_date, is_current) VALUES (?, ?, ?, ?, ?, ?)');
terms.forEach((t, i) => insertTerm.run(uuidv4(), sessionId, t.name, t.start, t.end, i === 0 ? 1 : 0));

// Create sample classes
console.log('Seeding classes...');
const classNames = ['Kindergarten', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
const insertClass = db.prepare('INSERT OR IGNORE INTO classes (id, branch_id, name, numeric_name, sort_order) VALUES (?, ?, ?, ?, ?)');
const insertSection = db.prepare('INSERT OR IGNORE INTO sections (id, class_id, name, capacity) VALUES (?, ?, ?, ?)');

classNames.forEach((name, i) => {
  const classId = uuidv4();
  insertClass.run(classId, branchId, name, i, i);
  insertSection.run(uuidv4(), classId, 'A', 40);
  insertSection.run(uuidv4(), classId, 'B', 40);
});

// Create sample subjects
console.log('Seeding subjects...');
const subjectNames = ['Mathematics', 'English', 'Biology', 'Chemistry', 'Physics', 'Social Studies', 'Geography', 'History', 'ICT', 'Business', 'Economics', 'Civic Education'];
const insertSubject = db.prepare('INSERT OR IGNORE INTO subjects (id, branch_id, name, code) VALUES (?, ?, ?, ?)');
subjectNames.forEach(name => {
  insertSubject.run(uuidv4(), branchId, name, name.substring(0, 3).toUpperCase());
});

// Create departments
console.log('Seeding departments...');
const deptNames = ['Science', 'Arts', 'Languages', 'Mathematics', 'Administration', 'ICT'];
const insertDept = db.prepare('INSERT OR IGNORE INTO departments (id, branch_id, name) VALUES (?, ?, ?)');
deptNames.forEach(name => insertDept.run(uuidv4(), branchId, name));

// Create designations
console.log('Seeding designations...');
const designationNames = ['Principal', 'Vice Principal', 'Head of Department', 'Senior Teacher', 'Teacher', 'Assistant Teacher', 'Registrar', 'Accountant', 'Librarian', 'Lab Technician'];
const insertDesig = db.prepare('INSERT OR IGNORE INTO designations (id, name) VALUES (?, ?)');
designationNames.forEach(name => insertDesig.run(uuidv4(), name));

// Phase 2: Exam Types
console.log('Seeding exam types...');
const examTypes = [
  { name: 'Quiz', percentage: 10 },
  { name: 'Continuous Assessment', percentage: 30 },
  { name: 'Midterm Examination', percentage: 20 },
  { name: 'Final Examination', percentage: 50 },
  { name: 'Mock Examination', percentage: 0 },
];
const insertExamType = db.prepare('INSERT OR IGNORE INTO exam_types (id, name, percentage) VALUES (?, ?, ?)');
examTypes.forEach(et => insertExamType.run(uuidv4(), et.name, et.percentage));

// Grade Scale
console.log('Seeding grade scale...');
const gradeScaleId = uuidv4();
db.prepare('INSERT OR IGNORE INTO grade_scales (id, name, is_default) VALUES (?, ?, 1)').run(gradeScaleId, 'Standard Grading Scale');

const gradeEntries = [
  { grade: 'A+', min: 90, max: 100, gp: 4.0, remark: 'Excellent' },
  { grade: 'A', min: 80, max: 89.99, gp: 3.7, remark: 'Very Good' },
  { grade: 'B+', min: 75, max: 79.99, gp: 3.3, remark: 'Good' },
  { grade: 'B', min: 70, max: 74.99, gp: 3.0, remark: 'Above Average' },
  { grade: 'C+', min: 65, max: 69.99, gp: 2.7, remark: 'Average' },
  { grade: 'C', min: 60, max: 64.99, gp: 2.3, remark: 'Satisfactory' },
  { grade: 'D', min: 50, max: 59.99, gp: 2.0, remark: 'Below Average' },
  { grade: 'F', min: 0, max: 49.99, gp: 0.0, remark: 'Fail' },
];
const insertGradeEntry = db.prepare('INSERT OR IGNORE INTO grade_scale_entries (id, grade_scale_id, grade, min_percentage, max_percentage, grade_point, remark, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
gradeEntries.forEach((ge, i) => insertGradeEntry.run(uuidv4(), gradeScaleId, ge.grade, ge.min, ge.max, ge.gp, ge.remark, i));

// Timetable periods
console.log('Seeding timetable periods...');
const periods = [
  { name: 'Period 1', start: '08:00', end: '08:45', is_break: 0 },
  { name: 'Period 2', start: '08:45', end: '09:30', is_break: 0 },
  { name: 'Period 3', start: '09:30', end: '10:15', is_break: 0 },
  { name: 'Break', start: '10:15', end: '10:45', is_break: 1 },
  { name: 'Period 4', start: '10:45', end: '11:30', is_break: 0 },
  { name: 'Period 5', start: '11:30', end: '12:15', is_break: 0 },
  { name: 'Lunch', start: '12:15', end: '13:00', is_break: 1 },
  { name: 'Period 6', start: '13:00', end: '13:45', is_break: 0 },
  { name: 'Period 7', start: '13:45', end: '14:30', is_break: 0 },
];
const insertPeriod = db.prepare('INSERT OR IGNORE INTO timetable_periods (id, branch_id, name, start_time, end_time, is_break, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
periods.forEach((p, i) => insertPeriod.run(uuidv4(), branchId, p.name, p.start, p.end, p.is_break, i));

// Fee types
console.log('Seeding fee types...');
const feeTypes = [
  { name: 'Tuition Fee', code: 'TUI', is_recurring: 1 },
  { name: 'Registration Fee', code: 'REG', is_recurring: 0 },
  { name: 'Lab Fee', code: 'LAB', is_recurring: 1 },
  { name: 'Library Fee', code: 'LIB', is_recurring: 1 },
  { name: 'Sports Fee', code: 'SPT', is_recurring: 1 },
  { name: 'Transport Fee', code: 'TRN', is_recurring: 1 },
  { name: 'Exam Fee', code: 'EXM', is_recurring: 1 },
  { name: 'Uniform Fee', code: 'UNI', is_recurring: 0 },
];
const insertFeeType = db.prepare('INSERT OR IGNORE INTO fee_types (id, name, code, is_recurring) VALUES (?, ?, ?, ?)');
feeTypes.forEach(ft => insertFeeType.run(uuidv4(), ft.name, ft.code, ft.is_recurring));

// Income categories
console.log('Seeding income categories...');
const incomeCategories = ['Donations', 'Government Grant', 'Rental Income', 'Event Revenue', 'Miscellaneous Income'];
const insertIncomeCat = db.prepare('INSERT OR IGNORE INTO income_categories (id, name) VALUES (?, ?)');
incomeCategories.forEach(name => insertIncomeCat.run(uuidv4(), name));

// Expense categories
console.log('Seeding expense categories...');
const expenseCategories = ['Salaries', 'Utilities', 'Maintenance', 'Office Supplies', 'Teaching Materials', 'Furniture & Equipment', 'Transportation', 'Events', 'Miscellaneous'];
const insertExpenseCat = db.prepare('INSERT OR IGNORE INTO expense_categories (id, name) VALUES (?, ?)');
expenseCategories.forEach(name => insertExpenseCat.run(uuidv4(), name));

// Book categories
console.log('Seeding book categories...');
const bookCategories = ['Fiction', 'Non-Fiction', 'Science', 'Mathematics', 'History', 'Literature', 'Reference', 'Textbook'];
const insertBookCat = db.prepare('INSERT OR IGNORE INTO book_categories (id, name) VALUES (?, ?)');
bookCategories.forEach(name => insertBookCat.run(uuidv4(), name));

// Inventory categories
console.log('Seeding inventory categories...');
const invCategories = ['Furniture', 'Electronics', 'Stationery', 'Cleaning Supplies', 'Sports Equipment', 'Lab Equipment', 'Kitchen Items'];
const insertInvCat = db.prepare('INSERT OR IGNORE INTO inventory_categories (id, name) VALUES (?, ?)');
invCategories.forEach(name => insertInvCat.run(uuidv4(), name));

// Certificate templates
console.log('Seeding certificate templates...');
const certTemplates = [
  { name: 'Transfer Certificate', type: 'transfer', content: 'This is to certify that {{student_name}}, bearing admission number {{admission_number}}, was a student of Class {{class}} at our institution. They are hereby granted this Transfer Certificate as on {{date}}.\n\nCertificate No: {{certificate_number}}' },
  { name: 'Character Certificate', type: 'character', content: 'This is to certify that {{student_name}} of Class {{class}} has been a student of good character and conduct during their stay at this institution. This certificate is issued on {{date}} upon request.\n\nCertificate No: {{certificate_number}}' },
  { name: 'Bonafide Certificate', type: 'bonafide', content: 'This is to certify that {{student_name}}, Admission No. {{admission_number}}, is a bonafide student of Class {{class}} of this institution for the current academic session.\n\nIssued on: {{date}}\nCertificate No: {{certificate_number}}' },
];
const insertCertTemplate = db.prepare('INSERT OR IGNORE INTO certificate_templates (id, name, type, content) VALUES (?, ?, ?, ?)');
certTemplates.forEach(ct => insertCertTemplate.run(uuidv4(), ct.name, ct.type, ct.content));

// Leave types
console.log('Seeding leave types...');
const leaveTypes = [
  { name: 'Annual Leave', days: 21, paid: 1 },
  { name: 'Sick Leave', days: 14, paid: 1 },
  { name: 'Maternity Leave', days: 90, paid: 1 },
  { name: 'Paternity Leave', days: 5, paid: 1 },
  { name: 'Casual Leave', days: 10, paid: 1 },
  { name: 'Unpaid Leave', days: 30, paid: 0 },
  { name: 'Bereavement Leave', days: 5, paid: 1 },
];
const insertLeaveType = db.prepare('INSERT OR IGNORE INTO leave_types (id, name, days_allowed, is_paid) VALUES (?, ?, ?, ?)');
leaveTypes.forEach(lt => insertLeaveType.run(uuidv4(), lt.name, lt.days, lt.paid));

// Default salary structure
console.log('Seeding salary structure...');
const structId = uuidv4();
db.prepare('INSERT OR IGNORE INTO salary_structures (id, name, description) VALUES (?, ?, ?)').run(structId, 'Standard Teaching Staff', 'Default salary structure for teaching staff');

const salaryComponents = [
  { name: 'Housing Allowance', type: 'earning', calc: 'percentage', amount: 20, order: 1 },
  { name: 'Transport Allowance', type: 'earning', calc: 'fixed', amount: 50, order: 2 },
  { name: 'Medical Allowance', type: 'earning', calc: 'percentage', amount: 10, order: 3 },
  { name: 'Tax (PAYE)', type: 'deduction', calc: 'percentage', amount: 5, order: 4 },
  { name: 'Social Security', type: 'deduction', calc: 'percentage', amount: 3, order: 5 },
];
const insertSalaryComp = db.prepare('INSERT OR IGNORE INTO salary_components (id, structure_id, name, type, calculation_type, amount, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
salaryComponents.forEach(sc => insertSalaryComp.run(uuidv4(), structId, sc.name, sc.type, sc.calc, sc.amount, sc.order));

// Notification templates
console.log('Seeding notification templates...');
const notificationTemplates = [
  { name: 'Fee Payment Reminder', type: 'both', event: 'fee_reminder', subject: 'Fee Payment Reminder', body: 'Dear {{parent_name}}, this is a reminder that {{student_name}}\'s fee of {{amount}} is due on {{due_date}}. Please make payment at your earliest convenience.', vars: 'parent_name,student_name,amount,due_date' },
  { name: 'Exam Schedule Notification', type: 'both', event: 'exam_schedule', subject: 'Exam Schedule Released', body: 'Dear {{name}}, the exam schedule for {{exam_name}} has been released. Please check the portal for details. Exam starts on {{start_date}}.', vars: 'name,exam_name,start_date' },
  { name: 'Attendance Alert', type: 'sms', event: 'attendance_alert', subject: '', body: 'Alert: {{student_name}} was marked absent on {{date}}. Please contact the school if this is incorrect.', vars: 'student_name,date' },
  { name: 'Result Published', type: 'both', event: 'result_published', subject: 'Exam Results Published', body: 'Dear {{parent_name}}, {{student_name}}\'s results for {{exam_name}} have been published. Please login to view the report card.', vars: 'parent_name,student_name,exam_name' },
  { name: 'Leave Approval', type: 'email', event: 'leave_approved', subject: 'Leave Application Approved', body: 'Dear {{employee_name}}, your leave application from {{start_date}} to {{end_date}} has been approved.', vars: 'employee_name,start_date,end_date' },
];
const insertNotifTemplate = db.prepare('INSERT OR IGNORE INTO notification_templates (id, name, type, event, subject, body, variables) VALUES (?, ?, ?, ?, ?, ?, ?)');
notificationTemplates.forEach(nt => insertNotifTemplate.run(uuidv4(), nt.name, nt.type, nt.event, nt.subject || null, nt.body, nt.vars));

console.log('\nSeed completed successfully!');
console.log('Default login credentials:');
console.log('  Username: admin');
console.log('  Password: admin123');
