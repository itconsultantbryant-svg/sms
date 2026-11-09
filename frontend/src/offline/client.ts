import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { operations, storeDelete, storeRead, storeWrite, OfflineOperation, expireReadCopies } from './storage';
import { nextOfflineVersion, offlineWriteSupported } from './policy';

const MAX_AGE = 24 * 60 * 60 * 1000;
let networkUnavailable = false;
export function offlineConnection() { return !navigator.onLine || networkUnavailable; }
let readinessWarning = '';
export function offlineReadinessWarning() { return readinessWarning; }
export function offlineSessionFresh() {
  try {
    const verified = Number(localStorage.getItem('afrimind_last_verified') || 0);
    const payload = JSON.parse(atob((localStorage.getItem('svl_token') || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return Date.now() - verified < MAX_AGE && payload.exp * 1000 > Date.now();
  } catch { return false; }
}
export function offlineIdentity() {
  try {
    const user = JSON.parse(localStorage.getItem('svl_user') || 'null');
    const selected = JSON.parse(localStorage.getItem('svl_selected_institution') || 'null');
    if (!user?.id) return null;
    const institution = user.user_type === 'platform_admin' ? selected?.id || '' : user.institution_id || '';
    return { owner: `${user.id}:${institution}`, userId: user.id, institution };
  } catch { return null; }
}
function signal() { window.dispatchEvent(new Event('afrimind:offline-changed')); }
function versionUrl(url: string) { return url.replace(/\/entries$/, ''); }
function cacheKey(owner: string, url: string, params?: any) {
  return `${owner}:${url}:${JSON.stringify(params || {}, Object.keys(params || {}).sort())}`;
}
function canCache(url: string) {
  return /^\/(auth\/me$|licensing\/check$|academics\b|branches\b|teachers\b|students$|dashboard\/(stats|teacher|student|staff|parent)$|teacher-dashboard\b|student-portal\b|parent-portal\b|attendance\b|gradebook\b|assignments\b|timetable\b|lesson-plans\b|permissions\/my-permissions$|settings\/(branding|institution)$|notifications\b)/.test(url);
}
function safeCopy(value: any): any {
  if (Array.isArray(value)) return value.map(safeCopy);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/password|bank_|basic_salary|medical_info|blood_group|file_data/i.test(key)).map(([key, item]) => [key, safeCopy(item)]));
}
function cachedResponse(config: InternalAxiosRequestConfig, data: any, headers: any = {}, status = 200): AxiosResponse {
  return { config, data, headers, status, statusText: status === 202 ? 'Saved locally, pending synchronization' : 'Offline cached copy' };
}
type Cached = { key: string; data: any; headers: any; savedAt: number };

export function offlineAdapter(network: AxiosAdapter): AxiosAdapter {
  return async config => {
    // Desktop already has a local API/SQLite and must keep using it without WAN.
    if (typeof (window as any).api?.getApiUrl === 'function') return network(config);
    const identity = offlineIdentity();
    const method = (config.method || 'get').toLowerCase();
    const url = String(config.url || '').split('?')[0];
    const key = identity ? cacheKey(identity.owner, url, config.params) : '';
    const writable = identity?.institution && offlineWriteSupported(method, url);
    let baseline: Cached | undefined;
    if (writable && method === 'put') baseline = await storeRead<Cached>('cache', cacheKey(identity!.owner, versionUrl(url)));
    const version = baseline?.headers?.['x-offline-version'];
    // Tag before sending: if a response is lost, replay uses the SAME ID.
    const operationId = writable && (method !== 'put' || version !== undefined) ? crypto.randomUUID() : undefined;
    if (operationId) {
      config.headers.set('X-Offline-Operation', operationId);
      if (version !== undefined) config.headers.set('X-Offline-Version', String(version));
    }
    const local = async () => {
      networkUnavailable = true;
      if (!identity || !offlineSessionFresh()) throw new Error('Connect to the internet and sign in before using offline mode');
      if (method === 'get') {
        const cached = canCache(url) ? await storeRead<Cached>('cache', key) : undefined;
        if (!cached || Date.now() - cached.savedAt > MAX_AGE) throw new Error('This page has no recent offline copy. Open it online first.');
        const data = structuredClone(cached.data);
        if (/^\/gradebook\/[^/]+$/.test(url) && Array.isArray(data.entries)) {
          for (const pending of (await operations(identity.owner)).filter(row => row.url === `${url}/entries`)) {
            for (const entry of JSON.parse(pending.data || '{}').entries || []) {
              const index = data.entries.findIndex((old: any) => old.student_id === entry.student_id && old.column_id === entry.column_id);
              if (index >= 0) data.entries[index] = { ...data.entries[index], ...entry };
              else data.entries.push(entry);
            }
          }
        }
        signal();
        return cachedResponse(config, data, { ...cached.headers, 'x-afrimind-offline': 'true' });
      }
      if (!operationId) throw new Error('This action requires an internet connection, or a previously downloaded record version. No change was submitted.');
      if (!navigator.locks) throw new Error('This browser supports offline reading only. Use a browser with Web Locks support for safe offline saves and synchronization.');
      const allPending = await operations(identity.owner);
      const pending = allPending.filter(item => item.url === url && item.method === method);
      if (pending.some(item => item.status !== 'pending')) throw new Error('Resolve the saved conflict for this record before adding more changes');
      const entry: OfflineOperation = {
        id: operationId, owner: identity.owner, institution: identity.institution, url, method,
        data: typeof config.data === 'string' ? config.data : JSON.stringify(config.data),
        version: version === undefined ? undefined : nextOfflineVersion(Number(version), pending.map(item => item.version ?? Number(version))),
        createdAt: Math.max(Date.now(), (allPending[allPending.length - 1]?.createdAt || 0) + 1), status: 'pending',
      };
      await storeWrite('outbox', entry); // Never show success unless durable storage completed.
      signal();
      return cachedResponse(config, { offline: true, queued: true, operation_id: entry.id, message: 'Saved on this device; waiting to synchronize' }, {}, 202);
    };
    if (!navigator.onLine) return local();
    try {
      const response = await network(config);
      if (networkUnavailable) { networkUnavailable = false; signal(); }
      if (identity && method === 'get' && canCache(url)) {
        // Cache failures must never turn a successful online request into a retry.
        try {
          const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
          await storeWrite('cache', { key, data: safeCopy(data), headers: { 'x-offline-version': response.headers?.['x-offline-version'] }, savedAt: Date.now() });
        } catch { /* Storage unavailable: online operation remains successful. */ }
      }
      return response;
    } catch (error: any) {
      if (error.response || error.code === 'ERR_CANCELED') throw error;
      return local();
    }
  };
}

let syncing = false;
export async function synchronize(): Promise<void> {
  if (!navigator.onLine || syncing) return;
  const identity = offlineIdentity();
  if (!identity?.institution) return;
  const run = async () => {
    syncing = true;
    try {
      for (const entry of await operations(identity.owner)) {
        if (entry.status !== 'pending') break;
        if (offlineIdentity()?.owner !== identity.owner) break;
        const token = localStorage.getItem('svl_token');
        if (!token) break;
        const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Institution-ID': entry.institution, 'X-Offline-Operation': entry.id };
        if (entry.version !== undefined) headers['X-Offline-Version'] = String(entry.version);
        let response: Response;
        try { response = await fetch(`/api${entry.url}`, { method: entry.method.toUpperCase(), headers, body: entry.data, signal: AbortSignal.timeout(30000) }); }
        catch { break; }
        if (response.status === 401 || response.status >= 500) break;
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          await storeWrite('outbox', { ...entry, status: response.status === 409 ? 'conflict' : 'rejected', error: payload.error || `Server rejected the save (${response.status})` });
          break; // Preserve ordering and never silently overwrite a conflict.
        }
        if (response.headers.get('X-Offline-Acknowledged') !== entry.id || !response.headers.get('Content-Type')?.includes('application/json')) {
          await storeWrite('outbox', { ...entry, status: 'rejected', error: 'The server did not confirm this operation. Sign in again or review deployment access; the local copy is preserved.' });
          break;
        }
        await storeDelete('outbox', entry.id);
        signal();
        window.dispatchEvent(new Event('afrimind:synchronized'));
      }
    } finally { syncing = false; signal(); }
  };
  // Serializes replay across tabs. Do not replay without this guarantee.
  if (navigator.locks) await navigator.locks.request('afrimind-offline-sync', { ifAvailable: true }, async lock => { if (lock) await run(); });
}

export function startOfflineSupport() {
  void expireReadCopies().catch(() => {});
  if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol !== 'file:') {
    readinessWarning = 'Preparing offline page cache. Keep this page online until preparation finishes.';
    navigator.serviceWorker.register('/service-worker.js')
      .then(() => navigator.serviceWorker.ready)
      .then(() => { readinessWarning = navigator.locks ? '' : 'This browser supports offline reading only; safe synchronization requires Web Locks support.'; signal(); })
      .catch(() => { readinessWarning = 'Offline page reload is not ready. Check deployment access and reconnect before relying on offline mode.'; signal(); });
  }
  window.addEventListener('online', () => { signal(); void synchronize(); });
  window.addEventListener('offline', signal);
  window.addEventListener('svl:user-changed', () => { signal(); void synchronize(); });
  window.addEventListener('svl:institution-changed', () => { signal(); void synchronize(); });
  window.setInterval(() => { void synchronize(); }, 15000);
}
