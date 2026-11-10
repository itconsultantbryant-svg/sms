import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

const initial = { first_name: '', middle_name: '', last_name: '', date_of_birth: '', gender: '',
  phone: '', email: '', address: '', parent_name: '', parent_phone: '', parent_email: '',
  parent_address: '', parent_occupation: '', previous_school: '', previous_class: '',
  medical_conditions: '', class_id: '', session_id: '', section_id: '', branch_id: '' };

export default function ApplicationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState(initial);
  const [application, setApplication] = useState<any>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [enrollment, setEnrollment] = useState<any>(null);
  const [remarks, setRemarks] = useState('');
  const canReview = ['platform_admin', 'institution_admin', 'principal'].some(role =>
    user?.user_type === role || user?.role_codes?.includes(role));
  const canEnroll = user?.user_type === 'platform_admin' || user?.user_type === 'institution_admin' || user?.permissions?.includes('students.create');

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setEnrollment(null); setApplication(null);
    const rows = (data: any) => Array.isArray(data) ? data : data.data || [];
    Promise.all([
      api.get('/academics/classes'), api.get('/academics/sessions'), api.get('/academics/sections'), api.get('/branches'),
      id ? api.get(`/admission/applications/${id}`) : Promise.resolve(null),
    ]).then(([cls, ses, sec, br, app]) => {
      if (!active) return;
      setClasses(rows(cls.data)); setSessions(rows(ses.data)); setSections(rows(sec.data)); setBranches(rows(br.data));
      if (app) {
        const a = app.data;
        setApplication(a);
        const values = { ...initial };
        for (const key of Object.keys(initial) as (keyof typeof initial)[]) values[key] = a[key] || '';
        values.parent_name = a.parent ? `${a.parent.first_name} ${a.parent.last_name}`.trim() : '';
        for (const field of ['phone', 'email', 'address', 'occupation'] as const) values[`parent_${field}`] = a.parent?.[field] || '';
        setForm(values);
      } else setForm({ ...initial, session_id: rows(ses.data).find((s: any) => s.is_current)?.id || '', branch_id: user?.branch?.id || '' });
    }).catch((e) => { if (active) setError(e.response?.data?.error || e.message || 'Could not load application'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const mutate = async (action: () => Promise<void>) => {
    if (saving) return;
    setSaving(true); setError('');
    try { await action(); } catch (e: any) { setError(e.response?.data?.error || e.message || 'Application could not be saved'); }
    finally { setSaving(false); }
  };
  const statusUpdate = (status: string) => mutate(async () => {
    await api.put(`/admission/applications/${id}/status`, { status, remarks });
    setApplication((await api.get(`/admission/applications/${id}`)).data);
  });
  const enroll = () => {
    if (!confirm('Enroll this approved applicant? This creates student and guardian accounts and assigns configured class fees.')) return;
    void mutate(async () => {
      const result = await api.post(`/admission/applications/${id}/enroll`, {
        class_id: form.class_id, session_id: form.session_id, section_id: form.section_id,
      });
      // Only in component memory: do not persist, log, or include passwords in URLs.
      setEnrollment(result.data);
      setApplication((current: any) => ({ ...current, status: 'admitted', converted_to_student_id: result.data.id }));
    });
  };
  const field = (key: keyof typeof initial, label: string, type = 'text', required = false) => (
    <label className="block text-sm" key={key}>{label}{required && ' *'}
      <input name={key} type={type} required={required} className="input-field mt-1" value={form[key]}
        disabled={!!id || saving} onChange={e => setForm({ ...form, [key]: e.target.value })} />
    </label>
  );
  if (loading) return <div role="status" className="p-8">Loading application…</div>;
  return <div className="max-w-4xl mx-auto space-y-6">
    <Link to="/admission/applications" className="text-primary-600">← Admission Applications</Link>
    <h1 className="text-2xl font-semibold">{id ? 'Admission Application' : 'New Admission Application'}</h1>
    {error && <div role="alert" className="p-4 bg-red-50 text-red-700">{error}</div>}
    {id && !application ? null : <>
      {application && <p>{application.application_number} · Status: <strong>{application.status.replace('_', ' ')}</strong></p>}
      {enrollment && <section className="p-4 bg-green-50 space-y-2" aria-label="Enrollment result">
        <h2 className="font-semibold">Student enrolled</h2>
        <p>Class fees assigned: {enrollment.fees_assigned ?? 'Previously enrolled'}</p>
        {enrollment.username && <p>Student username: {enrollment.username} · Temporary password: <code>{enrollment.temporary_password}</code></p>}
        {enrollment.parent_credentials && <p>Guardian username: {enrollment.parent_credentials.username} · Temporary password: <code>{enrollment.parent_credentials.temporary_password}</code></p>}
        <p>Share these credentials securely now. Passwords are not shown again after leaving this page.</p>
        <button type="button" className="btn-secondary" onClick={() => setEnrollment(null)}>Hide credentials</button>
      </section>}
      {application?.converted_to_student_id && <Link className="text-primary-600 block" to={`/students/${application.converted_to_student_id}/edit`}>Open enrolled student</Link>}
      <form className="bg-white p-6 rounded-lg shadow space-y-6" onSubmit={e => { e.preventDefault(); if (id) return; void mutate(async () => {
        const result = await api.post('/admission/applications', form);
        navigate(`/admission/applications/${result.data.id}`);
      }); }}>
        <h2 className="font-semibold">Student and guardian information</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {field('first_name', 'First name', 'text', true)}{field('last_name', 'Last name', 'text', true)}
          {field('middle_name', 'Middle name')}{field('date_of_birth', 'Date of birth', 'date')}
          <label className="text-sm">Gender<select className="input-field mt-1" value={form.gender} disabled={!!id || saving} onChange={e => setForm({ ...form, gender: e.target.value })}>
            <option value="">Not specified</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
          </select></label>
          {field('phone', 'Student phone')}{field('email', 'Student email', 'email')}{field('address', 'Address')}
          {field('parent_name', 'Parent/guardian name', 'text', true)}{field('parent_phone', 'Parent/guardian phone', 'tel', true)}
          {field('parent_email', 'Parent/guardian email', 'email')}{field('parent_address', 'Parent/guardian address')}
          {field('parent_occupation', 'Parent/guardian occupation')}{field('previous_school', 'Previous school')}
          {field('previous_class', 'Previous class')}{field('medical_conditions', 'Medical conditions')}
        </div>
        <h2 className="font-semibold">Enrollment placement</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <label className="text-sm">Class *<select aria-label="Class" required className="input-field mt-1" value={form.class_id} disabled={saving || application?.status === 'admitted'} onChange={e => setForm({ ...form, class_id: e.target.value, section_id: '' })}>
            <option value="">Select class</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
          <label className="text-sm">Academic session *<select aria-label="Academic session" required className="input-field mt-1" value={form.session_id} disabled={saving || application?.status === 'admitted'} onChange={e => setForm({ ...form, session_id: e.target.value })}>
            <option value="">Select session</option>{sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
          <label className="text-sm">Section<select aria-label="Section" className="input-field mt-1" value={form.section_id} disabled={saving || application?.status === 'admitted'} onChange={e => setForm({ ...form, section_id: e.target.value })}>
            <option value="">No section</option>{sections.filter(s => s.class_id === form.class_id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
          <label className="text-sm">Branch<select aria-label="Branch" className="input-field mt-1" value={form.branch_id} disabled={!!id || saving || !!user?.branch?.id} onChange={e => setForm({ ...form, branch_id: e.target.value })}>
            <option value="">School-wide</option>{branches.map(b => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
          </select></label>
        </div>
        {!id && <button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Create application'}</button>}
        {id && application?.status === 'approved' && canEnroll && <button type="button" className="btn-primary" disabled={saving || !form.class_id || !form.session_id} onClick={enroll}>{saving ? 'Enrolling…' : 'Enroll student'}</button>}
        {id && canReview && application?.status !== 'admitted' && <section className="space-y-3">
          <label className="block text-sm">Review remarks<textarea className="input-field mt-1" value={remarks} onChange={e => setRemarks(e.target.value)} disabled={saving} /></label>
          <div className="flex gap-3">
            {['pending', 'rejected', 'approved'].includes(application?.status) && <button type="button" className="btn-secondary" disabled={saving} onClick={() => statusUpdate('under_review')}>Move to review</button>}
            {application?.status === 'under_review' && <>
              <button type="button" className="btn-primary" disabled={saving} onClick={() => statusUpdate('approved')}>Approve application</button>
              <button type="button" className="btn-secondary" disabled={saving} onClick={() => statusUpdate('rejected')}>Reject application</button>
            </>}
          </div>
        </section>}
      </form>
    </>}
  </div>;
}
