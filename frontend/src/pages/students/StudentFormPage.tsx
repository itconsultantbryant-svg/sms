import { useState, useEffect, FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { Class, Section, Branch, AcademicSession } from '../../types';
import PasswordReset from '../../components/common/PasswordReset';

export default function StudentFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = Boolean(id);
  const [loading, setLoading] = useState(false);
  const [selectedClass, setSelectedClass] = useState('');
  const [recordLoading, setRecordLoading] = useState(!!id);
  const [recordError, setRecordError] = useState('');
  const [studentRecord, setStudentRecord] = useState<any>(null);
  const [guardians, setGuardians] = useState<any[]>([]);
  const [guardianCredentials, setGuardianCredentials] = useState<{ username: string; temporary_password: string } | null>(null);

  const [form, setForm] = useState({
    first_name: '', middle_name: '', last_name: '',
    date_of_birth: '', gender: '', nationality: 'Liberian',
    county: '', address: '', phone: '', email: '',
    photo: '',
    blood_group: '', medical_info: '',
    previous_school: '', previous_class: '', admission_date: '',
    branch_id: '', class_id: '', section_id: '', session_id: '',
    status: 'active',
    parent: { id: '', first_name: '', last_name: '', relationship: 'father', phone: '', email: '', occupation: '', address: '', workplace: '' },
  });
  const [priorRecord, setPriorRecord] = useState({
    id: '',
    record_type: 'previous_gradesheet',
    title: '',
    notes: '',
    file_data: '',
    file_name: '',
    mime_type: '',
    school_name: '', class_name: '', session_name: '',
  });
  const [removeFile, setRemoveFile] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{
    admission_number: string;
    temporary_password: string;
    parent_credentials?: { username: string; temporary_password: string } | null;
  } | null>(null);

  const { data: classes } = useQuery<Class[]>({
    queryKey: ['classes'],
    queryFn: () => api.get('/academics/classes').then(r => r.data),
  });

  const { data: sections } = useQuery<Section[]>({
    queryKey: ['sections', selectedClass],
    queryFn: () => api.get('/academics/sections', { params: { class_id: selectedClass } }).then(r => r.data),
    enabled: !!selectedClass,
  });

  const { data: branches } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches').then(r => r.data),
  });

  const { data: sessions } = useQuery<AcademicSession[]>({
    queryKey: ['sessions'],
    queryFn: () => api.get('/academics/sessions').then(r => Array.isArray(r.data) ? r.data : Array.isArray(r.data?.data) ? r.data.data : []),
  });

  useEffect(() => {
    if (id) {
      setRecordLoading(true); setRecordError('');
      api.get(`/students/${id}`).then(res => {
        const s = res.data;
        setStudentRecord(s); setGuardians(s.parents || []);
        setForm(prev => ({
          ...Object.fromEntries(Object.keys(prev).map(key => [key, s[key] ?? prev[key as keyof typeof prev]])) as typeof prev,
          parent: { ...prev.parent, ...Object.fromEntries(Object.entries(s.parents?.[0] || {}).map(([key, value]) => [key, value ?? ''])) },
        }));
        setSelectedClass(s.class_id || '');
      }).catch(e => setRecordError(e.response?.data?.error || 'Could not load student details'))
        .finally(() => setRecordLoading(false));
    }
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name.startsWith('parent.')) {
      const field = name.split('.')[1];
      setForm(prev => ({ ...prev, parent: { ...prev.parent, [field]: value } }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
      if (name === 'class_id') { setSelectedClass(value); setForm(prev => ({ ...prev, section_id: '' })); }
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.first_name || !form.last_name) {
      toast.error('First name and last name are required');
      return;
    }
    setLoading(true);
    try {
      const payload: any = { ...form };
      if (priorRecord.id || priorRecord.file_data || priorRecord.title || priorRecord.notes) {
        const record: any = { ...priorRecord,
          school_name: priorRecord.id ? priorRecord.school_name : priorRecord.school_name || form.previous_school || null,
          class_name: priorRecord.id ? priorRecord.class_name : priorRecord.class_name || form.previous_class || null };
        if (record.id && !record.file_data) { delete record.file_data; delete record.file_name; delete record.mime_type; }
        if (removeFile) Object.assign(record, { file_data: null, file_name: null, mime_type: null });
        payload.prior_records = [record];
      }
      if (isEdit) {
        const response = await api.put(`/students/${id}`, payload);
        for (const key of ['students', 'student-view', 'parents', 'parent-view']) void queryClient.invalidateQueries({ queryKey: [key] });
        if (response.data.parent_credentials) { setGuardianCredentials(response.data.parent_credentials); return; }
        toast.success('Student updated successfully');
        navigate('/students');
      } else {
        const res = await api.post('/students', payload);
        setCreatedCreds({
          admission_number: res.data.admission_number,
          temporary_password: res.data.temporary_password,
          parent_credentials: res.data.parent_credentials,
        });
        toast.success('Student admitted — save the login credentials below');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.details || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const onPhoto = async (file: File | null) => {
    if (!file) return;
    try {
      const { compressImageToDataUrl } = await import('../../utils/compressImage');
      const dataUrl = await compressImageToDataUrl(file);
      setForm((prev) => ({ ...prev, photo: dataUrl }));
    } catch {
      toast.error('Could not process image');
    }
  };

  if (createdCreds) {
    return (
      <div className="max-w-lg space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Student created</h1>
        <div className="card space-y-3">
          <p className="text-sm text-gray-600">Share these credentials with the student. They login with Student ID + password.</p>
          <div>
            <div className="text-xs text-gray-500">Student ID (username)</div>
            <div className="font-mono font-semibold">{createdCreds.admission_number}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Temporary password</div>
            <div className="font-mono font-semibold">{createdCreds.temporary_password}</div>
          </div>
          {createdCreds.parent_credentials && (
            <div className="border-t pt-3 space-y-2">
              <p className="text-sm font-medium">Parent login</p>
              <div className="font-mono text-sm">User: {createdCreds.parent_credentials.username}</div>
              <div className="font-mono text-sm">Pass: {createdCreds.parent_credentials.temporary_password}</div>
            </div>
          )}
          <button type="button" className="btn-primary" onClick={() => navigate('/students')}>Done</button>
        </div>
      </div>
    );
  }
  if (recordLoading) return <p role="status" className="p-8">Loading complete student record…</p>;
  if (recordError) return <p role="alert" className="p-8 text-red-700">{recordError}</p>;
  if (guardianCredentials) return <section className="card max-w-xl space-y-4"><h1 className="text-xl font-semibold">Student updated and guardian account created</h1><p>Share these credentials securely. They are shown only once.</p><p>Guardian username: <code>{guardianCredentials.username}</code></p><p>Temporary password: <code>{guardianCredentials.temporary_password}</code></p><button type="button" className="btn-primary" onClick={() => navigate('/students')}>Done</button></section>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEdit ? 'Edit Student' : 'New Admission'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {isEdit ? 'Update student information' : 'Register a new student'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Personal Information</h2>
          <div className="mb-4 flex items-center gap-4">
            {form.photo ? (
              <img src={form.photo} alt="" className="w-20 h-20 rounded-full object-cover border" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gray-200" />
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Profile photo</label>
              <input type="file" accept="image/*" onChange={(e) => onPhoto(e.target.files?.[0] || null)} />
              {form.photo && <button type="button" className="ml-3 text-sm text-red-700" onClick={() => setForm(prev => ({ ...prev, photo: '' }))}>Remove photo</button>}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
              <input name="first_name" value={form.first_name} onChange={handleChange} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Middle Name</label>
              <input name="middle_name" value={form.middle_name} onChange={handleChange} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
              <input name="last_name" value={form.last_name} onChange={handleChange} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
              <input name="date_of_birth" type="date" value={form.date_of_birth} onChange={handleChange} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
              <select name="gender" value={form.gender} onChange={handleChange} className="input-field">
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nationality</label>
              <input name="nationality" value={form.nationality} onChange={handleChange} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">County</label>
              <input name="county" value={form.county} onChange={handleChange} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input name="phone" value={form.phone} onChange={handleChange} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input name="email" type="email" value={form.email} onChange={handleChange} className="input-field" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <textarea name="address" value={form.address} onChange={handleChange} className="input-field" rows={2} />
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Academic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
              <select name="branch_id" value={form.branch_id} onChange={handleChange} className="input-field">
                <option value="">Select Branch</option>
                {(Array.isArray(branches) ? branches : []).map(b => <option key={b.id} value={b.id}>{b.branch_name || b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
              <select name="class_id" value={form.class_id} onChange={handleChange} className="input-field">
                <option value="">Select Class</option>
                {(Array.isArray(classes) ? classes : []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
              <select name="section_id" value={form.section_id} onChange={handleChange} className="input-field">
                <option value="">Select Section</option>
                {sections?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Academic Session</label>
              <select name="session_id" value={form.session_id} onChange={handleChange} className="input-field">
                <option value="">Select Session</option>
                {(Array.isArray(sessions) ? sessions : []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                {Array.isArray(sessions) && !sessions.length && <option value="" disabled>No sessions yet — create one under Academics</option>}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admission Date</label>
              <input name="admission_date" type="date" value={form.admission_date} onChange={handleChange} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Previous school</label>
              <input name="previous_school" value={form.previous_school} onChange={handleChange} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Previous class</label>
              <input name="previous_class" value={form.previous_class} onChange={handleChange} className="input-field" />
            </div>
            {isEdit && <label className="text-sm">Student status<select aria-label="Student status" name="status" className="input-field mt-1" value={form.status} onChange={handleChange}>
              {['active', 'inactive', 'graduated', 'transferred', 'withdrawn', 'suspended', 'deceased'].map(status => <option key={status} value={status}>{status}</option>)}
            </select></label>}
          </div>
        </div>

        <section className="card"><h2 className="mb-4 text-lg font-semibold">Health Information</h2><div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm">Blood group<input name="blood_group" value={form.blood_group} onChange={handleChange} className="input-field mt-1" /></label>
          <label className="text-sm">Medical information<textarea name="medical_info" value={form.medical_info} onChange={handleChange} className="input-field mt-1" rows={3} /></label>
        </div></section>
        {(
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Previous gradesheet / transfer transcript</h2>
            <p className="text-sm text-gray-500 mb-4">Attach prior academic records for transfer students. These stay in the student file.</p>
            {isEdit && <div className="mb-4 space-y-2">{(studentRecord?.prior_records || []).map((record: any) => <div key={record.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <span>{record.title || record.record_type} · {record.file_name || 'No attachment'}</span>
              <button type="button" className="text-primary-600" onClick={() => { setPriorRecord({ id: record.id, record_type: record.record_type, title: record.title || '', notes: record.notes || '', file_data: '', file_name: record.file_name || '', mime_type: record.mime_type || '', school_name: record.school_name || '', class_name: record.class_name || '', session_name: record.session_name || '' }); setRemoveFile(false); }}>Edit prior record</button>
            </div>)}{priorRecord.id && <button type="button" className="btn-secondary" onClick={() => { setPriorRecord({ id: '', record_type: 'previous_gradesheet', title: '', notes: '', file_data: '', file_name: '', mime_type: '', school_name: '', class_name: '', session_name: '' }); setRemoveFile(false); }}>Add a different prior record</button>}</div>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(['school_name', 'class_name', 'session_name'] as const).map(key => <label key={key} className="text-sm">Prior record {key.replace('_name', '')}<input className="input-field mt-1" value={priorRecord[key]} onChange={e => setPriorRecord(prev => ({ ...prev, [key]: e.target.value }))} /></label>)}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Record type</label>
                <select
                  className="input-field"
                  value={priorRecord.record_type}
                  onChange={(e) => setPriorRecord((prev) => ({ ...prev, record_type: e.target.value }))}
                >
                  <option value="previous_gradesheet">Previous gradesheet</option>
                  <option value="transfer_transcript">Transfer transcript</option>
                  <option value="prior_class">Prior class record</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  className="input-field"
                  value={priorRecord.title}
                  onChange={(e) => setPriorRecord((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. 2024/25 transcript"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Upload file (PDF or image)</label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) {
                      toast.error('File must be under 5MB');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      setRemoveFile(false);
                      setPriorRecord((prev) => ({
                        ...prev,
                        file_data: String(reader.result || ''),
                        file_name: file.name,
                        mime_type: file.type || 'application/octet-stream',
                        title: prev.title || file.name,
                      }));
                    };
                    reader.readAsDataURL(file);
                  }}
                />
                {priorRecord.file_name ? <p className="text-xs text-green-600 mt-1">Attached: {priorRecord.file_name}</p> : null}
                {priorRecord.id && priorRecord.file_name && <button type="button" className="mt-2 text-sm text-red-700" onClick={() => { setRemoveFile(true); setPriorRecord(prev => ({ ...prev, file_data: '', file_name: '', mime_type: '' })); }}>Remove attachment on save</button>}
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  className="input-field"
                  rows={2}
                  value={priorRecord.notes}
                  onChange={(e) => setPriorRecord((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>
          </div>
        )}

        {(
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Parent/Guardian Information</h2>
            {isEdit && <><p className="mb-3 text-sm text-gray-500">Changes to a linked guardian also update that guardian's shared record for their other children.</p>
              {guardians.length > 0 && <label className="mb-4 block text-sm">Guardian to edit<select aria-label="Guardian to edit" className="input-field mt-1" value={form.parent.id} onChange={e => {
                const guardian = guardians.find(p => p.id === e.target.value);
                setForm(prev => ({ ...prev, parent: { ...prev.parent, ...Object.fromEntries(Object.keys(prev.parent).map(key => [key, guardian?.[key] ?? ''])) } }));
              }}>{guardians.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}{p.is_primary ? ' (primary)' : ''}</option>)}</select></label>}
            </>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input name="parent.first_name" value={form.parent.first_name} onChange={handleChange} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input name="parent.last_name" value={form.parent.last_name} onChange={handleChange} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Relationship</label>
                <select name="parent.relationship" value={form.parent.relationship} onChange={handleChange} className="input-field">
                  <option value="father">Father</option>
                  <option value="mother">Mother</option>
                  <option value="guardian">Guardian</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input name="parent.phone" value={form.parent.phone} onChange={handleChange} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input name="parent.email" type="email" value={form.parent.email} onChange={handleChange} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Occupation</label>
                <input name="parent.occupation" value={form.parent.occupation} onChange={handleChange} className="input-field" />
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Guardian address</label><input name="parent.address" value={form.parent.address} onChange={handleChange} className="input-field" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Workplace</label><input name="parent.workplace" value={form.parent.workplace} onChange={handleChange} className="input-field" /></div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate('/students')} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Saving...' : isEdit ? 'Update Student' : 'Admit Student'}
          </button>
        </div>
      </form>
      {isEdit && <PasswordReset key={id} resource="students" id={id!} username={studentRecord?.username} />}
    </div>
  );
}
