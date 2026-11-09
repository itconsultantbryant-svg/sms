import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import api from '../utils/api';
import { User } from '../types';

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
        .then((res) => setUser(res.data))
        .catch(() => {
          localStorage.removeItem('svl_token');
          localStorage.removeItem('svl_user');
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
