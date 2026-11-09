# MIGRATION STRATEGY: Single-Tenant → Multi-Tenant
## AfriMind Tech & AI Consulting Agency (AfriMind) School Management System

**Date:** August 3, 2026  
**Strategy:** Hybrid Rebuild with Data Preservation

---

## OVERVIEW

We're transforming the existing single-tenant system into a multi-tenant SaaS platform while preserving all working modules.

**Key Changes:**
1. Add `institutions` table as top-level tenant
2. Add `institution_id` to ALL existing tables
3. Rebuild authentication hierarchy
4. Add tenant isolation middleware
5. Update all queries to filter by institution_id

---

## MIGRATION PHASES

### **PHASE 1A: Foundation (Week 1)**
**Goal:** Establish multi-tenant database structure

**Steps:**
1. ✅ Create `schema-multitenant.ts` with core tables:
   - institutions
   - branches (refactored with institution_id)
   - users (refactored)
   - roles (refactored)
   - permissions
   - institution_settings
   - audit_logs
   - subscription_plans
   - institution_subscriptions
   - resellers

2. ⏳ Update ALL existing schema files:
   - Add `institution_id TEXT REFERENCES institutions(id)` to:
     - students
     - parents
     - employees (teachers)
     - classes
     - sections
     - subjects
     - attendance
     - exams
     - marks
     - results
     - fee_types
     - invoices
     - payments
     - ALL 85+ tables

3. ⏳ Create migration script:
   - Create default institution from current data
   - Populate institution_id in all existing records
   - Add foreign key constraints

---

### **PHASE 1B: Authentication Rebuild (Week 1)**
**Goal:** Multi-tenant authentication system

**Current Structure:**
```
users → role → permissions
```

**New Structure:**
```
Platform Super Admin (AfriMind)
    ↓
Institution Admin (per school)
    ↓
Branch Admin (per campus)
    ↓
Department Roles (Teacher, Accountant, etc.)
    ↓
End Users (Parents, Students)
```

**Implementation:**
1. ⏳ Update `authRouter`:
   - Add institution context to JWT
   - Add tenant validation middleware
   - Platform admin can switch institutions
   - Institution admin scoped to their institution

2. ⏳ Create tenant middleware:
   ```typescript
   export const tenantMiddleware = (req, res, next) => {
     const institution_id = req.user.institution_id;
     if (!institution_id && req.user.user_type !== 'platform_admin') {
       return res.status(403).json({ error: 'No institution access' });
     }
     req.institution_id = institution_id;
     next();
   };
   ```

3. ⏳ Update all routes:
   - Inject `institution_id` into all queries
   - Add tenant validation
   - Filter all results by institution

---

### **PHASE 1C: Core Module Updates (Week 2)**
**Goal:** Update existing modules for multi-tenancy

**Students Module:**
- ✅ Backend exists
- ⏳ Add institution_id filtering
- ⏳ Update admission number generation (per institution)

**Teachers/Employees:**
- ✅ Backend exists
- ⏳ Add institution_id filtering
- ⏳ Update employee ID generation

**Academic (Classes/Subjects):**
- ✅ Backend exists
- ⏳ Add institution_id filtering

**Attendance:**
- ✅ Backend exists
- ⏳ Add institution_id filtering

**Examinations/Results:**
- ✅ Backend exists
- ⏳ Add institution_id filtering

**Fees/Payments:**
- ✅ Backend exists
- ⏳ Add institution_id filtering

---

### **PHASE 2: Missing Critical Modules (Weeks 3-4)**

**Priority 1: Admission Module** [3-4 days]
```
admission_enquiries
    ↓
admission_applications
    ↓
admission_tests (optional)
    ↓
admission_decisions
    ↓
students (conversion)
```

**Priority 2: Proper Accounting** [5-7 days]
```
chart_of_accounts
    ↓
journal_entries
    ↓
ledger
    ↓
trial_balance → balance_sheet → P&L
```

**Priority 3: Enhanced Reception** [2-3 days]
```
visitor_management
enquiry_tracking
complaint_management
```

**Priority 4: Complete Settings** [2-3 days]
```
Institution-specific settings
SMS/Email configuration
Theme customization
```

---

### **PHASE 3: Platform Admin Interface (Week 5)**
**Goal:** Super admin can manage multiple institutions

**Features:**
1. **Institution Management**
   - Create new institution
   - View all institutions
   - Edit institution settings
   - Suspend/Activate institution
   - View subscription status

2. **User Management**
   - Assign institution admins
   - Reset passwords
   - View login activity
   - Manage access

3. **Subscription Management**
   - View all subscriptions
   - Renew subscriptions
   - Upgrade/Downgrade plans
   - Billing history

4. **Analytics Dashboard**
   - Total institutions
   - Active users across platform
   - Revenue tracking
   - Usage statistics

5. **Reseller Management**
   - Create resellers
   - Assign institutions
   - Commission tracking

---

### **PHASE 4: Enhanced Features (Weeks 6-7)**

**Week 6:**
- Complete Reports Module
- Payment Gateway Structure
- SMS Gateway Integration
- Email SMTP Configuration

**Week 7:**
- Backup/Restore Implementation
- Security Hardening
- Performance Optimization
- API Documentation

---

## DATABASE CHANGES SUMMARY

### New Tables Added (8)
1. `institutions` - Top-level tenants
2. `institution_settings` - Per-institution config
3. `subscription_plans` - Platform plans
4. `institution_subscriptions` - Billing tracking
5. `resellers` - Franchise partners
6. `reseller_institutions` - Reseller assignments
7. `audit_logs` - Security audit trail
8. (roles/users refactored with institution support)

### Tables Requiring institution_id (85+)
**Phase 1 Core:**
- students
- parents
- student_parents
- employees
- departments
- designations

**Academic:**
- academic_sessions
- terms
- classes
- sections
- subjects
- class_subjects
- teacher_assignments

**Attendance & Timetable:**
- attendance
- timetable_periods
- timetable_entries

**Examinations:**
- exam_types
- examinations
- exam_schedules
- marks
- grade_scales
- grade_scale_entries
- exam_results

**Fees & Finance:**
- fee_types
- fee_structures
- invoices
- invoice_items
- payments
- income_categories
- expense_categories
- account_transactions

**Phase 4 Modules:**
- books
- book_categories
- book_issues
- inventory_categories
- inventory_items
- stock_transactions
- vehicles
- transport_routes
- route_stops
- student_transport
- visitors
- phone_calls
- postal_records
- certificate_templates
- certificates
- id_card_templates

**Phase 5 HR:**
- salary_structures
- salary_components
- employee_salaries
- payroll_runs
- payslips
- payslip_items
- leave_types
- leave_applications
- employee_loans

**Phase 6 Communication:**
- sms_messages
- sms_recipients
- email_messages
- email_recipients
- announcements
- notification_templates
- communication_log

**Phase 7 Reports:**
- report_templates
- report_logs
- system_backups
- dashboard_stats
- custom_fields
- custom_field_values
- bulk_operations

---

## SQL MIGRATION SCRIPT

```sql
-- Step 1: Create default institution from existing data
INSERT INTO institutions (
  id, 
  institution_code, 
  institution_name,
  email,
  phone,
  country,
  currency,
  currency_symbol,
  timezone,
  is_active,
  setup_completed
)
SELECT 
  'default-inst-001',
  'SVLA',
  'AfriMind Academy',
  email,
  mobile,
  country,
  currency,
  currency_symbol,
  timezone,
  1,
  1
FROM institutions_old LIMIT 1;

-- Step 2: Update branches table
ALTER TABLE branches ADD COLUMN institution_id TEXT REFERENCES institutions(id);
UPDATE branches SET institution_id = 'default-inst-001';

-- Step 3: Add institution_id to all tables (example for students)
ALTER TABLE students ADD COLUMN institution_id TEXT REFERENCES institutions(id);
UPDATE students SET institution_id = 'default-inst-001';

-- Repeat for all 85+ tables...

-- Step 4: Create indexes
CREATE INDEX idx_students_institution ON students(institution_id);
-- Repeat for all tables...
```

---

## CODE CHANGES REQUIRED

### 1. Middleware Updates
```typescript
// backend/src/middleware/tenant.ts
export const injectTenant = (req: AuthRequest, res: Response, next: NextFunction) => {
  const user = req.user;
  
  if (user.user_type === 'platform_admin') {
    // Platform admin can specify institution via header or query
    req.institution_id = req.headers['x-institution-id'] || req.query.institution_id;
  } else {
    // Regular users scoped to their institution
    req.institution_id = user.institution_id;
  }
  
  if (!req.institution_id) {
    return res.status(403).json({ error: 'Institution context required' });
  }
  
  next();
};
```

### 2. Route Updates (Example: Students)
```typescript
// BEFORE:
studentsRouter.get('/', (req: AuthRequest, res: Response) => {
  const students = db.prepare('SELECT * FROM students').all();
  res.json(students);
});

// AFTER:
studentsRouter.get('/', injectTenant, (req: AuthRequest, res: Response) => {
  const students = db.prepare(
    'SELECT * FROM students WHERE institution_id = ?'
  ).all(req.institution_id);
  res.json(students);
});
```

### 3. Frontend Updates
```typescript
// Store institution context in AuthContext
const AuthContext = {
  user: {...},
  institution: {...},
  institutions: [...], // For platform admin
  switchInstitution: (id) => {...}
};

// Add to API requests
api.defaults.headers['X-Institution-ID'] = currentInstitution.id;
```

---

## TESTING STRATEGY

### Unit Tests
- [ ] Tenant isolation (User A can't see User B's data)
- [ ] Platform admin can switch institutions
- [ ] Institution admin limited to their institution
- [ ] All queries filtered by institution_id

### Integration Tests
- [ ] Create institution
- [ ] Assign users to institution
- [ ] Multi-tenant data isolation
- [ ] Cross-institution security

### Load Tests
- [ ] 100+ institutions
- [ ] 10,000+ students across institutions
- [ ] Query performance with institution filter

---

## ROLLBACK PLAN

If migration fails:
1. Restore database from backup
2. Revert code to previous commit
3. Analyze failure
4. Fix and retry

**Backup Points:**
- Before schema changes
- After adding institution_id columns
- After data migration
- After constraint addition

---

## SUCCESS CRITERIA

✅ **Phase 1 Complete When:**
- [ ] Multi-tenant schema deployed
- [ ] All tables have institution_id
- [ ] Authentication supports multi-institution
- [ ] Tenant middleware working
- [ ] All existing modules filter by institution
- [ ] Zero cross-tenant data leaks
- [ ] Platform admin can create institutions
- [ ] Institution admin can manage their school

✅ **Production Ready When:**
- [ ] All critical modules complete
- [ ] Security audit passed
- [ ] Performance benchmarks met
- [ ] Documentation complete
- [ ] Admin training completed
- [ ] Pilot institution onboarded

---

## TIMELINE

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1 | Foundation | Multi-tenant schema, auth rebuild |
| 2 | Module Updates | All modules tenant-aware |
| 3 | Admission Module | Complete admission workflow |
| 4 | Accounting | Proper double-entry system |
| 5 | Platform Admin | Super admin interface |
| 6 | Integrations | Payment, SMS, Email |
| 7 | Production Prep | Security, testing, docs |

**Total: 7 weeks to production-ready multi-tenant SaaS**

---

## NEXT IMMEDIATE STEPS

1. ⏳ Update all existing schema files with institution_id
2. ⏳ Create migration script
3. ⏳ Update auth system
4. ⏳ Create tenant middleware
5. ⏳ Update all routes
6. ⏳ Build platform admin interface
7. ⏳ Test tenant isolation
8. ⏳ Deploy and verify

---

**Status:** Phase 1A Started  
**Current:** Multi-tenant foundation schema created  
**Next:** Update existing schema files with institution_id
