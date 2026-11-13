import { useState } from 'react';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

export default function PasswordReset({ resource, id, username }: { resource: 'students' | 'teachers' | 'parents'; id: string; username?: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const allowed = ['platform_admin', 'institution_admin', 'registrar'].some(role => user?.user_type === role || user?.role?.code === role || user?.role_codes?.includes(role));
  if (!allowed) return null;
  return <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-label="Account access">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-gray-900">Account access</h3><p className="mt-1 text-sm text-gray-500">Username: {username || 'Not available'}</p></div>
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => { setOpen(!open); setPassword(''); setConfirmPassword(''); setMessage(''); setError(''); }}>Reset password</button></div>
    {message && <p role="status" className="mt-4 text-sm text-green-700">{message}</p>}
    {open && <form className="mt-5 space-y-4 border-t pt-5" onSubmit={async e => {
      e.preventDefault(); if (busy) return;
      if (password !== confirmPassword) { setError('Passwords do not match'); return; }
      setBusy(true); setError('');
      try { const r = await api.post(`/${resource}/${id}/reset-password`, { new_password: password }); setPassword(''); setConfirmPassword(''); setOpen(false); setMessage(r.data.message); }
      catch (err: any) { setError(err.response?.data?.error || err.message || 'Password could not be updated'); }
      finally { setBusy(false); }
    }}>
      <p className="text-sm text-gray-600">The new password works immediately and signs out existing online sessions. Share it securely with the account holder. Offline devices cannot receive a reset until they reconnect.</p>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">New password<input className="input-field mt-1" type="password" autoComplete="new-password" minLength={12} maxLength={72} required value={password} disabled={busy} onChange={e => setPassword(e.target.value)} /></label>
        <label className="text-sm">Confirm new password<input className="input-field mt-1" type="password" autoComplete="new-password" required value={confirmPassword} disabled={busy} onChange={e => setConfirmPassword(e.target.value)} /></label></div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Updating…' : 'Update password now'}</button>
    </form>}
  </section>;
}
