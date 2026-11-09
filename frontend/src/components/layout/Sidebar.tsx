import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, GraduationCap, UserCircle, Building2,
  BookOpen, Settings, X, ClipboardCheck, Clock, ClipboardList,
  DollarSign, Library, Package, Bus, DoorOpen, Award, Briefcase, Send, BarChart3, Shield, KeyRound, MonitorSmartphone
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { COMPANY_NAME, COMPANY_SHORT_NAME } from '../../utils/company';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  {
    name: 'Admission', icon: UserCircle, children: [
      { name: 'Dashboard', href: '/admission' },
      { name: 'Enquiries', href: '/admission/enquiries' },
      { name: 'Applications', href: '/admission/applications' },
    ]
  },
  { name: 'Students', href: '/students', icon: GraduationCap },
  { name: 'Parents', href: '/parents', icon: Users },
  { name: 'Teachers', href: '/teachers', icon: UserCircle },
  {
    name: 'Academics', icon: BookOpen, children: [
      { name: 'Sessions', href: '/academics/sessions' },
      { name: 'Classes', href: '/academics/classes' },
      { name: 'Subjects', href: '/academics/subjects' },
    ]
  },
  { name: 'Attendance', href: '/attendance', icon: ClipboardCheck },
  { name: 'Timetable', href: '/timetable', icon: Clock },
  { name: 'Examinations', href: '/examinations', icon: ClipboardList },
  {
    name: 'Finance', icon: DollarSign, children: [
      { name: 'Fee Setup', href: '/fees' },
      { name: 'Invoices', href: '/fees/invoices' },
      { name: 'Payments', href: '/fees/payments' },
      { name: 'Accounts', href: '/accounts' },
    ]
  },
  { name: 'Library', href: '/library', icon: Library },
  { name: 'Inventory', href: '/inventory', icon: Package },
  { name: 'Transport', href: '/transport', icon: Bus },
  { name: 'Reception', href: '/reception', icon: DoorOpen },
  { name: 'Certificates', href: '/certificates', icon: Award },
  { name: 'HR & Payroll', href: '/payroll', icon: Briefcase },
  { name: 'Communication', href: '/communication', icon: Send },
  { name: 'Reports', href: '/reports', icon: BarChart3 },
  { name: 'Branches', href: '/branches', icon: Building2 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user } = useAuth();
  const isPlatformAdmin = user?.user_type === 'platform_admin';

  if (!open) return null;

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-primary-900 text-white flex flex-col z-30">
      <div className="flex items-center justify-between h-16 px-4 border-b border-primary-800">
        <div>
          <h1 className="text-sm font-bold tracking-wide" title={COMPANY_NAME}>{COMPANY_SHORT_NAME}</h1>
          <p className="text-[10px] text-primary-300 tracking-wider">SCHOOL MANAGEMENT SYSTEM</p>
        </div>
        <button onClick={onClose} className="lg:hidden text-primary-300 hover:text-white">
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        {isPlatformAdmin && (
          <>
            <NavLink
              to="/platform-admin"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-800 text-white border-r-3 border-white'
                    : 'text-primary-200 hover:bg-primary-800 hover:text-white'
                }`
              }
            >
              <Shield size={18} />
              Platform Admin
            </NavLink>
            <NavLink
              to="/platform-admin/licenses"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-800 text-white border-r-3 border-white'
                    : 'text-primary-200 hover:bg-primary-800 hover:text-white'
                }`
              }
            >
              <KeyRound size={18} />
              License Keys
            </NavLink>
            <NavLink
              to="/platform-admin/activations"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-800 text-white border-r-3 border-white'
                    : 'text-primary-200 hover:bg-primary-800 hover:text-white'
                }`
              }
            >
              <MonitorSmartphone size={18} />
              Activations
            </NavLink>
          </>
        )}
        {navigation.map((item) => (
          <div key={item.name}>
            {item.href ? (
              <NavLink
                to={item.href}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-primary-800 text-white border-r-3 border-white'
                      : 'text-primary-200 hover:bg-primary-800 hover:text-white'
                  }`
                }
              >
                <item.icon size={18} />
                {item.name}
              </NavLink>
            ) : (
              <div>
                <div className="flex items-center gap-3 px-4 py-2.5 text-sm text-primary-300 font-medium uppercase tracking-wider mt-4">
                  <item.icon size={18} />
                  {item.name}
                </div>
                {item.children?.map((child) => (
                  <NavLink
                    key={child.href}
                    to={child.href}
                    className={({ isActive }) =>
                      `flex items-center gap-3 pl-11 pr-4 py-2 text-sm transition-colors ${
                        isActive
                          ? 'bg-primary-800 text-white'
                          : 'text-primary-200 hover:bg-primary-800 hover:text-white'
                      }`
                    }
                  >
                    {child.name}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-primary-800">
        <p className="text-[10px] text-primary-400 text-center">
          &copy; 2026 {COMPANY_SHORT_NAME}
        </p>
      </div>
    </aside>
  );
}
