import { useState, FormEvent, useEffect } from 'react';
import { useNavigate, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useBrand } from '../../contexts/BrandContext';
import { getRoleHomePath } from '../../utils/roleHome';
import { schoolCodeFromHostname } from '../../utils/schoolHost';
import { COMPANY_NAME, COMPANY_SHORT_NAME } from '../../utils/company';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { user, login } = useAuth();
  const { branding, loadBrandingByCode, setBranding } = useBrand();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [showSchoolCode, setShowSchoolCode] = useState(false);
  const [loading, setLoading] = useState(false);

  const hostSchool = schoolCodeFromHostname(window.location.hostname);

  useEffect(() => {
    const preset = searchParams.get('school') || hostSchool || '';
    if (preset) {
      setSchoolCode(preset);
      loadBrandingByCode(preset);
    }
  }, [hostSchool, loadBrandingByCode, searchParams]);

  if (user) return <Navigate to={getRoleHomePath(user)} replace />;

  const handleLoadSchool = async () => {
    if (!schoolCode.trim()) {
      toast.error('Enter your school code');
      return;
    }
    const b = await loadBrandingByCode(schoolCode.trim());
    if (!b) toast.error('School not found');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error('Please enter username and password');
      return;
    }
    setLoading(true);
    try {
      await login(username, password);
      const stored = JSON.parse(localStorage.getItem('svl_user') || '{}');
      if (stored?.institution_code) {
        setBranding({
          institution_name: stored.institution_name,
          institution_code: stored.institution_code,
          logo: stored.institution_logo,
          website: stored.institution_website,
          motto: stored.institution_motto,
          primary_color: stored.primary_color,
          secondary_color: stored.secondary_color,
          accent_color: stored.accent_color,
        });
      }
      navigate(getRoleHomePath(stored));
      toast.success('Welcome back!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const primary = branding?.primary_color || '#1e40af';
  const secondary = branding?.secondary_color || '#1e3a8a';
  const schoolName = branding?.institution_name || COMPANY_SHORT_NAME;
  const subtitle = branding?.institution_name
    ? (branding.motto || 'School Management Portal')
    : 'School Management System';

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 55%, #0f172a 100%)`,
      }}
    >
      <div className="w-full max-w-md px-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            {branding?.logo ? (
              <img
                src={branding.logo}
                alt={schoolName}
                className="h-16 w-auto mx-auto mb-3 object-contain"
              />
            ) : (
              <div
                className="w-14 h-14 rounded-xl mx-auto mb-3 flex items-center justify-center text-white text-xl font-bold"
                style={{ backgroundColor: primary }}
              >
                {(schoolName || 'S').charAt(0)}
              </div>
            )}
            <h1 className="text-xl font-bold tracking-wide" style={{ color: primary }}>
              {schoolName}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
            {branding?.institution_code && (
              <p className="text-xs text-gray-400 mt-1">Code: {branding.institution_code}</p>
            )}
            {!hostSchool && (
            <button
              type="button"
              onClick={() => setShowSchoolCode((v) => !v)}
              className="mt-3 text-xs font-medium underline"
              style={{ color: primary }}
            >
              {branding?.institution_name ? 'Change school' : 'Have a school code?'}
            </button>
            )}
            {showSchoolCode && (
              <div className="mt-3 text-left">
                <label className="block text-xs font-medium text-gray-600 mb-1">School code (optional)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={schoolCode}
                    onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
                    className="input-field"
                    placeholder="e.g. VHS"
                  />
                  <button type="button" onClick={handleLoadSchool} className="btn-secondary shrink-0">
                    Load
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">Loads the school logo, name, motto, and code. Not required to sign in.</p>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username / Student ID
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field"
                placeholder="Username, email, or Student ID"
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1">Students: use your Student ID and default password</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-white font-medium transition-opacity disabled:opacity-50"
              style={{ backgroundColor: primary }}
            >
              {loading ? 'Signing in...' : 'Login'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-400">
              Both Online and Offline &bull; Reliable &bull; Secure &bull; User-friendly
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-white/70 mt-6">
          &copy; 2026 {COMPANY_NAME} ({COMPANY_SHORT_NAME}). All Rights Reserved.
        </p>
      </div>
    </div>
  );
}
