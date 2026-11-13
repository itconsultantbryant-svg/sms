import { useEffect, useState, FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../utils/api';
import PasswordReset from '../../components/common/PasswordReset';
import { ProfileHeader } from '../../components/common/RecordDialog';

const initial = { first_name: '', last_name: '', relationship: 'guardian', phone: '', email: '', address: '', occupation: '', workplace: '', photo: '' };
export default function ParentFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initial);
  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get(`/parents/${id}`).then(r => { setRecord(r.data); setForm(Object.fromEntries(Object.keys(initial).map(key => [key, r.data[key] ?? ''])) as typeof initial); })
      .catch(e => setError(e.response?.data?.error || 'Could not load parent details')).finally(() => setLoading(false));
  }, [id]);
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      await api.put(`/parents/${id}`, form);
      for (const key of ['parents', 'parent-view', 'student-view']) void queryClient.invalidateQueries({ queryKey: [key] });
      navigate('/parents');
    } catch (e: any) { setError(e.response?.data?.error || e.message || 'Could not save parent details'); }
    finally { setBusy(false); }
  };
  if (loading) return <p role="status" className="p-8">Loading parent record…</p>;
  if (!record) return <p role="alert" className="p-8 text-red-700">{error}</p>;
  return <div className="mx-auto max-w-5xl space-y-6">
    <Link className="text-primary-600" to="/parents">← Parents / guardians</Link>
    <h1 className="text-2xl font-bold">Edit Parent / Guardian</h1>
    <div className="card"><ProfileHeader title={`${form.first_name} ${form.last_name}`} subtitle="Parent / guardian record" photo={form.photo} /></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}
    <form onSubmit={save} className="card space-y-6">
      <h2 className="text-lg font-semibold">Personal and contact information</h2>
      <p className="text-sm text-gray-500">This shared guardian record applies to all linked children.</p>
      <label className="block text-sm">Profile photo<input type="file" accept="image/*" className="mt-2 block" disabled={busy} onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return;
        try { const { compressImageToDataUrl } = await import('../../utils/compressImage'); const photo = await compressImageToDataUrl(file); setForm(prev => ({ ...prev, photo })); }
        catch { setError('Could not process profile image'); }
      }} /></label>
      {form.photo && <button type="button" className="text-sm text-red-700" onClick={() => setForm({ ...form, photo: '' })}>Remove photo</button>}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {([['first_name', 'First name'], ['last_name', 'Last name'], ['phone', 'Phone'], ['email', 'Email'], ['address', 'Address'], ['occupation', 'Occupation'], ['workplace', 'Workplace']] as const).map(([key, label]) =>
          <label key={key} className="text-sm">{label}<input className="input-field mt-1" name={key} type={key === 'email' ? 'email' : 'text'} required={key === 'first_name' || key === 'last_name'} value={form[key]} disabled={busy} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}
        <label className="text-sm">Relationship<select aria-label="Relationship" className="input-field mt-1" value={form.relationship} onChange={e => setForm({ ...form, relationship: e.target.value })}>
          {['father', 'mother', 'guardian', 'other'].map(value => <option key={value} value={value}>{value}</option>)}
        </select></label>
      </div>
      <div className="flex justify-end gap-3"><Link className="btn-secondary" to="/parents">Cancel</Link><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Update parent'}</button></div>
    </form>
    <PasswordReset key={id} resource="parents" id={id!} username={record.username} />
  </div>;
}
