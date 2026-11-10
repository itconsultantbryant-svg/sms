import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useLicense } from './contexts/LicenseContext';
import { getRoleHomePath } from './utils/roleHome';
import MainLayout from './components/layout/MainLayout';
import LoginPage from './pages/auth/LoginPage';
import SetupWizard from './pages/licensing/SetupWizard';
import DemoModeWatermark from './components/DemoModeWatermark';
import DashboardPage from './pages/dashboard/DashboardPage';
import FinanceDashboardPage from './pages/dashboard/FinanceDashboardPage';
import StaffDashboardPage from './pages/dashboard/StaffDashboardPage';
import TeacherDashboardPage from './pages/dashboard/TeacherDashboardPage';
import StudentDashboardPage from './pages/dashboard/StudentDashboardPage';
import ParentDashboardPage from './pages/dashboard/ParentDashboardPage';
import StudentsPage from './pages/students/StudentsPage';
import StudentFormPage from './pages/students/StudentFormPage';
import ParentsPage from './pages/parents/ParentsPage';
import TeachersPage from './pages/teachers/TeachersPage';
import TeacherFormPage from './pages/teachers/TeacherFormPage';
import ClassesPage from './pages/academics/ClassesPage';
import SubjectsPage from './pages/academics/SubjectsPage';
import SessionsPage from './pages/academics/SessionsPage';
import DepartmentsPage from './pages/academics/DepartmentsPage';
import SchoolUsersPage from './pages/users/SchoolUsersPage';
import PortalFeesPage from './pages/fees/PortalFeesPage';
import BranchesPage from './pages/branches/BranchesPage';
import SettingsPage from './pages/settings/SettingsPage';
import AttendancePage from './pages/attendance/AttendancePage';
import TimetablePage from './pages/timetable/TimetablePage';
import ExamsPage from './pages/examinations/ExamsPage';
import ExamSchedulesPage from './pages/examinations/ExamSchedulesPage';
import MarksEntryPage from './pages/examinations/MarksEntryPage';
import ResultsPage from './pages/results/ResultsPage';
import ReportCardPage from './pages/results/ReportCardPage';
import FeesPage from './pages/fees/FeesPage';
import InvoicesPage from './pages/fees/InvoicesPage';
import PaymentsPage from './pages/fees/PaymentsPage';
import AccountsPage from './pages/accounts/AccountsPage';
import LibraryPage from './pages/library/LibraryPage';
import InventoryPage from './pages/inventory/InventoryPage';
import TransportPage from './pages/transport/TransportPage';
import ReceptionPage from './pages/reception/ReceptionPage';
import CertificatesPage from './pages/certificates/CertificatesPage';
import PayrollPage from './pages/payroll/PayrollPage';
import CommunicationPage from './pages/communication/CommunicationPage';
import ReportsPage from './pages/reports/ReportsPage';
import PlatformDashboardPage from './pages/platform-admin/PlatformDashboardPage';
import InstitutionsPage from './pages/platform-admin/InstitutionsPage';
import InstitutionFormPage from './pages/platform-admin/InstitutionFormPage';
import LicensesPage from './pages/platform-admin/LicensesPage';
import LicenseActivationsPage from './pages/platform-admin/LicenseActivationsPage';
import UsersPage from './pages/platform-admin/UsersPage';
import UserFormPage from './pages/platform-admin/UserFormPage';
import AdmissionDashboard from './pages/admission/AdmissionDashboard';
import EnquiriesPage from './pages/admission/EnquiriesPage';
import EnquiryFormPage from './pages/admission/EnquiryFormPage';
import ApplicationsPage from './pages/admission/ApplicationsPage';
import ApplicationPage from './pages/admission/ApplicationPage';
import RolesPage from './pages/permissions/RolesPage';
import UserAccessPage from './pages/permissions/UserAccessPage';
import PasswordRequestsPage from './pages/permissions/PasswordRequestsPage';
import AssignmentsPage from './pages/assignments/AssignmentsPage';
import TeacherClassesPage from './pages/teacher/TeacherClassesPage';
import TeacherStudentsPage from './pages/teacher/TeacherStudentsPage';
import StudentGradesPage from './pages/student/StudentGradesPage';
import StudentAssignmentsPage from './pages/student/StudentAssignmentsPage';
import StudentAttendancePage from './pages/student/StudentAttendancePage';
import ParentChildrenPage from './pages/parent/ParentChildrenPage';
import GradebookAdminPage from './pages/gradebook/GradebookAdminPage';
import GradebookTeacherPage from './pages/gradebook/GradebookTeacherPage';
import GradebookEntryPage from './pages/gradebook/GradebookEntryPage';
import LessonPlansAdminPage from './pages/lesson-plans/LessonPlansAdminPage';
import LessonPlansTeacherPage from './pages/lesson-plans/LessonPlansTeacherPage';
import ChangePasswordPage from './pages/auth/ChangePasswordPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function isPlatformAdminUser(): boolean {
  try {
    const raw = localStorage.getItem('svl_user');
    if (!raw) return false;
    const u = JSON.parse(raw);
    return u?.user_type === 'platform_admin';
  } catch {
    return false;
  }
}

function AppContent() {
  const { user } = useAuth();
  const { mode, isLoading } = useLicense();
  const isPlatformAdmin = user?.user_type === 'platform_admin' || isPlatformAdminUser();
  const home = getRoleHomePath(user);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            {!isPlatformAdmin && !mode && !localStorage.getItem('svl_license_mode') && !isLoading ? (
              <SetupWizard />
            ) : (
              <>
                {!isPlatformAdmin && <DemoModeWatermark />}
                <MainLayout>
                  <Routes>
                <Route path="/" element={<Navigate to={home} replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/finance/dashboard" element={<FinanceDashboardPage />} />
                <Route path="/staff/dashboard" element={<StaffDashboardPage />} />
                <Route path="/teacher/dashboard" element={<TeacherDashboardPage />} />
                <Route path="/student/dashboard" element={<StudentDashboardPage />} />
                <Route path="/parent/dashboard" element={<ParentDashboardPage />} />

                <Route path="/students" element={<StudentsPage />} />
                <Route path="/students/new" element={<StudentFormPage />} />
                <Route path="/students/:id/edit" element={<StudentFormPage />} />

                <Route path="/parents" element={<ParentsPage />} />

                <Route path="/teachers" element={<TeachersPage />} />
                <Route path="/staff" element={<TeachersPage staff />} />
                <Route path="/teachers/new" element={<TeacherFormPage />} />
                <Route path="/teachers/:id/edit" element={<TeacherFormPage />} />

                <Route path="/academics/classes" element={<ClassesPage />} />
                <Route path="/academics/subjects" element={<SubjectsPage />} />
                <Route path="/academics/sessions" element={<SessionsPage />} />
                <Route path="/academics/departments" element={<DepartmentsPage />} />
                <Route path="/users" element={<SchoolUsersPage />} />

                <Route path="/attendance" element={<AttendancePage />} />
                <Route path="/timetable" element={<TimetablePage />} />

                <Route path="/examinations" element={<ExamsPage />} />
                <Route path="/examinations/:examId/schedules" element={<ExamSchedulesPage />} />
                <Route path="/examinations/:examId/marks" element={<MarksEntryPage />} />
                <Route path="/examinations/:examId/results" element={<ResultsPage />} />
                <Route path="/results/report-card/:studentId/:examId" element={<ReportCardPage />} />

                <Route path="/assignments" element={<AssignmentsPage />} />

                <Route path="/fees" element={<FeesPage />} />
                <Route path="/fees/invoices" element={<InvoicesPage />} />
                <Route path="/fees/payments" element={<PaymentsPage />} />
                <Route path="/fees/collect" element={<PaymentsPage />} />
                <Route path="/student/fees" element={<PortalFeesPage />} />
                <Route path="/parent/fees" element={<PortalFeesPage />} />
                <Route path="/accounts" element={<AccountsPage />} />

                <Route path="/library" element={<LibraryPage />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/transport" element={<TransportPage />} />
                <Route path="/reception" element={<ReceptionPage />} />
                <Route path="/certificates" element={<CertificatesPage />} />
                <Route path="/payroll" element={<PayrollPage />} />
                <Route path="/communication" element={<CommunicationPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/branches" element={<BranchesPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/permissions/roles" element={<RolesPage />} />
                <Route path="/permissions/user-access" element={<UserAccessPage />} />
                <Route path="/permissions/password-requests" element={<PasswordRequestsPage />} />
                <Route path="/account/password" element={<ChangePasswordPage />} />

                <Route path="/gradebook" element={<GradebookAdminPage />} />
                <Route path="/gradebook/:id" element={<GradebookEntryPage />} />
                <Route path="/lesson-plans" element={<LessonPlansAdminPage />} />

                <Route path="/teacher/classes" element={<TeacherClassesPage />} />
                <Route path="/teacher/students" element={<TeacherStudentsPage />} />
                <Route path="/teacher/gradebook" element={<GradebookTeacherPage />} />
                <Route path="/teacher/lesson-plans" element={<LessonPlansTeacherPage />} />

                <Route path="/student/grades" element={<StudentGradesPage />} />
                <Route path="/student/assignments" element={<StudentAssignmentsPage />} />
                <Route path="/student/attendance" element={<StudentAttendancePage />} />

                <Route path="/parent/children" element={<ParentChildrenPage />} />

                <Route path="/platform-admin" element={<PlatformDashboardPage />} />
                <Route path="/platform-admin/institutions" element={<InstitutionsPage />} />
                <Route path="/platform-admin/institutions/new" element={<InstitutionFormPage />} />
                <Route path="/platform-admin/institutions/:id/edit" element={<InstitutionFormPage />} />
                <Route path="/platform-admin/licenses" element={<LicensesPage />} />
                <Route path="/platform-admin/activations" element={<LicenseActivationsPage />} />
                <Route path="/platform-admin/users" element={<UsersPage />} />
                <Route path="/platform-admin/users/new" element={<UserFormPage />} />
                <Route path="/platform-admin/users/:id/edit" element={<UserFormPage />} />

                <Route path="/admission" element={<AdmissionDashboard />} />
                <Route path="/admission/enquiries" element={<EnquiriesPage />} />
                <Route path="/admission/enquiries/new" element={<EnquiryFormPage />} />
                <Route path="/admission/enquiries/:id/edit" element={<EnquiryFormPage />} />
                <Route path="/admission/applications" element={<ApplicationsPage />} />
                <Route path="/admission/applications/new" element={<ApplicationPage />} />
                <Route path="/admission/applications/:id" element={<ApplicationPage />} />
                  </Routes>
                </MainLayout>
              </>
            )}
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return <AppContent />;
}
