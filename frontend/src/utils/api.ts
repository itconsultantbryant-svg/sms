import axios from 'axios';
import { offlineAdapter } from '../offline/client';

// In the web build VITE_API_URL is baked in at build time (from .env.production).
// In the Electron desktop build VITE_API_URL is intentionally left empty and the
// real backend URL (with its dynamically assigned port) is fetched from the main
// process at runtime via the preload bridge (window.api.getApiUrl()).
const buildTimeUrl = (import.meta.env.VITE_API_URL || '').trim();
// Hosted web calls /api on the same address the user opened. The Vercel
// project serves that API from this repo and stores data in Neon Postgres.
const fallbackUrl = import.meta.env.PROD ? '/api' : 'http://localhost:3001/api';

function isDesktopShell(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).api?.getApiUrl === 'function';
}

function hostedWebBaseUrl(): string | null {
  if (!import.meta.env.PROD || isDesktopShell()) return null;
  return '/api';
}

function normalize(raw: string): string {
  const trimmed = raw.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

let resolvedBaseUrl: string | null = null;

async function resolveBaseUrl(): Promise<string> {
  if (resolvedBaseUrl) return resolvedBaseUrl;

  // Electron desktop shell: ask the main process for the real backend URL.
  const apiBridge = (window as any).api;
  if (apiBridge && typeof apiBridge.getApiUrl === 'function') {
    try {
      const url = await apiBridge.getApiUrl();
      if (url) {
        resolvedBaseUrl = url;
        return resolvedBaseUrl;
      }
    } catch {
      // ignore — fall through to the build-time / default URL
    }
  }

  resolvedBaseUrl = hostedWebBaseUrl() || (buildTimeUrl ? normalize(buildTimeUrl) : fallbackUrl);
  return resolvedBaseUrl;
}

const initialBaseURL = hostedWebBaseUrl() || (buildTimeUrl ? normalize(buildTimeUrl) : fallbackUrl);

console.log('=== API CONFIGURATION ===');
console.log('Environment:', import.meta.env.MODE);
console.log('VITE_API_URL from env:', import.meta.env.VITE_API_URL);
console.log('Initial baseURL:', initialBaseURL);
console.log('========================');

export const api = axios.create({
  adapter: offlineAdapter(axios.getAdapter(axios.defaults.adapter)),
  baseURL: initialBaseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Resolve the real backend base URL at request time. In Electron this fetches
// the dynamically assigned localhost port from the main process; otherwise it
// falls back to the baked-in build URL. Cached after the first successful resolve.
api.interceptors.request.use(async (config) => {
  config.baseURL = await resolveBaseUrl();
  return config;
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('svl_token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const storedInstitution = localStorage.getItem('svl_selected_institution');
  if (storedInstitution) {
    try {
      const inst = JSON.parse(storedInstitution);
      if (inst?.id) {
        config.headers['X-Institution-ID'] = inst.id;
      }
    } catch (e) {}
  }

  console.log('API Request:', config.method?.toUpperCase(), config.baseURL + config.url);
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.message, error.config?.url);
    const status = error.response?.status;
    const url = String(error.config?.url || '');
    const onLoginPage =
      typeof window !== 'undefined' && window.location.pathname.startsWith('/login');
    const hadToken = !!localStorage.getItem('svl_token');

    // Only force logout/redirect when an existing session becomes invalid.
    // Unauthenticated public calls (license check before login) must not reload the page.
    const isPublicAuthCall =
      url.includes('/auth/login') ||
      url.includes('/licensing/check') ||
      url.includes('/licensing/activate');

    if (status === 401 && hadToken && !onLoginPage && !isPublicAuthCall) {
      localStorage.removeItem('svl_token');
      localStorage.removeItem('svl_user');
      window.location.href = '/login';
    }

    // A 403 with a license-related payload means the institution has no active
    // license (or it expired). Surface it to LicenseContext so it flips mode to
    // null and the SetupWizard gate takes over — instead of a flood of 403s on
    // every dashboard call. No hard redirect: LicenseContext drives the UI.
    if (status === 403 && hadToken && !isPublicAuthCall) {
      const msg = String(
        error.response?.data?.error ||
        error.response?.data?.message ||
        ''
      ).toLowerCase();
      const isLicenseError =
        msg.includes('license') ||
        msg.includes('license required') ||
        msg.includes('no active license') ||
        msg.includes('expired');

      if (isLicenseError && typeof window !== 'undefined') {
        console.log('📄 License 403 detected — notifying LicenseContext:', msg);
        window.dispatchEvent(new Event('svl:license-required'));
      }
    }
    return Promise.reject(error);
  }
);

export default api;
