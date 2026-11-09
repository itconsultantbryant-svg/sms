import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import api from '../utils/api';
import { User } from '../types';
import { offlineSessionFresh } from '../offline/client';

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('svl_token');
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const res = await api.get('/auth/me');
      if (!res.headers['x-afrimind-offline']) localStorage.setItem('afrimind_last_verified', String(Date.now()));
      setUser(res.data);
      localStorage.setItem('svl_user', JSON.stringify(res.data));
    } catch {
      // keep existing session on transient errors during poll
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('svl_token');
    if (token) {
      api.get('/auth/me')
        .then((res) => { setUser(res.data); if (!res.headers['x-afrimind-offline']) localStorage.setItem('afrimind_last_verified', String(Date.now())); })
        .catch((error) => {
          if (error.response?.status === 401) {
            localStorage.removeItem('svl_token');
            localStorage.removeItem('svl_user');
          } else {
            try { setUser(offlineSessionFresh() ? JSON.parse(localStorage.getItem('svl_user') || 'null') : null); } catch { setUser(null); }
          }
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  // Real-time-ish refresh of merged roles/permissions
  useEffect(() => {
    if (!user) return;
    const onFocus = () => { refreshUser(); };
    window.addEventListener('focus', onFocus);
    const interval = window.setInterval(() => { refreshUser(); }, 30000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
    };
  }, [user?.id, refreshUser]);

  const login = async (username: string, password: string) => {
    try {
      console.log('🔐 Login attempt:', username);
      const res = await api.post('/auth/login', { username, password });
      console.log('✅ Login response received:', { hasToken: !!res.data.token, hasUser: !!res.data.user });

      if (!res.data.token) {
        console.error('❌ No token in response:', res.data);
        throw new Error('No token received from server');
      }

      localStorage.setItem('svl_token', res.data.token);
      localStorage.setItem('svl_user', JSON.stringify(res.data.user));
      localStorage.setItem('afrimind_last_verified', String(Date.now()));

      // Clear stale license mode so the new user gets a fresh license check
      localStorage.removeItem('svl_license_mode');

      // CRITICAL: Immediately set the auth header for subsequent requests
      api.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;


      setUser(res.data.user);
      console.log('✅ Login complete');

      // Notify LicenseContext to re-check
      window.dispatchEvent(new Event('svl:user-changed'));
    } catch (error) {
      console.error('❌ Login error:', error);
      throw error;
    }
  };

  const logout = () => {
    delete api.defaults.headers.common['Authorization'];
    localStorage.removeItem('svl_token');
    localStorage.removeItem('svl_user');
    localStorage.removeItem('svl_selected_institution');
    localStorage.removeItem('svl_license_mode');
    setUser(null);
    window.dispatchEvent(new Event('svl:user-changed'));
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
