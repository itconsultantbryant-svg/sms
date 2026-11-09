import { useState, useEffect, FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { Branch, Department, Designation } from '../../types';

export default function TeacherFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const [form, setForm] = useState({
    first_name: '', middle_name: '', last_name: '',
    gender: '', date_of_birth: '', phone: '', email: '',
    address: '', photo: '', department_id: '', designation_id: '', branch_id: '',
    qualification: '', experience: '', employment_date: '',
    employment_type: 'full-time', basic_salary: '',
    bank_name: '', bank_account: '',
    generate_credentials: true,
  });
  const [createdCreds, setCreatedCreds] = useState<{ username: string; password: string } | null>(null);

  const { data: branches } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches').then(r => r.data),
  });

  const { data: departments } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/academics/departments').then(r => r.data),
  });

  const { data: designations } = useQuery<Designation[]>({
    queryKey: ['designations'],
    queryFn: () => api.get('/academics/designations').then(r => r.data),
  });
  const { data: classes } = useQuery<any[]>({
    queryKey: ['classes'],
    queryFn: () => api.get('/academics/classes').then(r => r.data),
    enabled: isEdit,
  });
  const { data: subjects } = useQuery<any[]>({
    queryKey: ['subjects'],
    queryFn: () => api.get('/academics/subjects').then(r => r.data),
    enabled: isEdit,
  });
  const { data: sessions } = useQuery<any[]>({
    queryKey: ['sessions'],
    queryFn: () => api.get('/academics/sessions').then(r => r.data),
    enabled: isEdit,
  });
  const { data: classSubjects = [] } = useQuery<any[]>({
    queryKey: ['class-subjects'], queryFn: () => api.get('/academics/class-subjects').then(r => r.data), enabled: isEdit,
  });
  const { data: teacherRecord, refetch: refetchTeacher } = useQuery<any>({
    queryKey: ['teacher', id],
    queryFn: () => api.get(`/teachers/${id}`).then(r => r.data),
    enabled: isEdit,
  });
  const [assignForm, setAssignForm] = useState({ class_ids: [] as string[], subject_ids: [] as string[], session_id: '', section_id: '' });
  const { data: sections = [] } = useQuery<any[]>({
    queryKey: ['sections', assignForm.class_ids[0]],
    queryFn: () => api.get('/academics/sections', { params: { class_id: assignForm.class_ids[0] } }).then(r => r.data),
    enabled: assignForm.class_ids.length === 1,
  });
  const selectedSession = assignForm.session_id || sessions?.find(item => item.is_current)?.id;
  const availableSubjects = (subjects || []).filter(subject => assignForm.class_ids.length > 0 && assignForm.class_ids.every(cid =>
    classSubjects.some(mapping => mapping.class_id === cid && mapping.subject_id === subject.id && (!mapping.session_id || mapping.session_id === selectedSession))));
  useEffect(() => {
    setAssignForm(previous => ({ ...previous, subject_ids: previous.subject_ids.filter(sid => availableSubjects.some(subject => subject.id === sid)), section_id: previous.class_ids.length === 1 ? previous.section_id : '' }));
  }, [assignForm.class_ids.join(','), selectedSession, JSON.stringify(classSubjects)]);

  useEffect(() => {
    if (id) {
      api.get(`/teachers/${id}`).then(res => {
        setForm(prev => ({ ...prev, ...res.data, basic_salary: res.data.basic_salary?.toString() || '' }));
      });
    }
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.first_name || !form.last_name) {
      toast.error('First name and last name are required');
      return;
    }
    setLoading(true);
    try {
      const payload = { ...form, basic_salary: parseFloat(form.basic_salary) || 0, generate_credentials: true };
      if (isEdit) {
        await api.put(`/teachers/${id}`, payload);
        toast.success('Teacher updated successfully');
        navigate('/teachers');
      } else {
        const res = await api.post('/teachers', payload);
        setCreatedCreds(res.data.credentials || null);
        toast.success('Teacher created — save credentials below');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Operation failed');
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
        <h1 className="text-2xl font-bold text-gray-900">Teacher created</h1>
        <div className="card space-y-3">
          <p className="text-sm text-gray-600">Share these login credentials with the teacher.</p>
          <div>
            <div className="text-xs text-gray-500">Username</div>
            <div className="font-mono font-semibold">{createdCreds.username}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Temporary password</div>
            <div className="font-mono font-semibold">{createdCreds.password}</div>
          </div>
          <button type="button" className="btn-primary" onClick={() => navigate('/teachers')}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Teacher' : 'Add Teacher'}</h1>
        <p className="text-sm text-gray-500 mt-1">{isEdit ? 'Update teacher information' : 'Register a new teacher'}</p>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
              <select name="gender" value={form.gender} onChange={handleChange} className="input-field">
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
              <input name="date_of_birth" type="date" value={form.date_of_birth} onChange={handleChange} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input name="phone" value={form.phone} onChange={handleChange} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input name="email" type="email" value={form.email} onChange={handleChange} className="input-field" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input name="address" value={form.address} onChange={handleChange} className="input-field" />
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Employment Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
              <select name="branch_id" value={form.branch_id} onChange={handleChange} className="input-field">
                <option value="">Select Branch</option>
                {branches?.map(b => <option key={b.id} value={b.id}>{(b as any).branch_name || b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <select name="department_id" value={form.department_id} onChange={handleChange} className="input-field">
                <option value="">Select Department</option>
                {departments?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
              <select name="designation_id" value={form.designation_id} onChange={handleChange} className="input-field">
                <option value="">Select Designation</option>
                {designations?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Qualification</label>
              <input name="qualification" value={form.qualification} onChange={handleChange} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Experience</label>
              <input name="experience" value={form.experience} onChange={handleChange} className="input-field" placeholder="e.g. 5 years" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employment Date</label>
              <input name="employment_date" type="date" value={form.employment_date} onChange={handleChange} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
              <select name="employment_type" value={form.employment_type} onChange={handleChange} className="input-field">
                <option value="full-time">Full Time</option>
                <option value="part-time">Part Time</option>
                <option value="contract">Contract</option>
                <option value="temporary">Temporary</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Basic Salary ($)</label>
              <input name="basic_salary" type="number" value={form.basic_salary} onChange={handleChange} className="input-field" />
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Bank Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
              <input name="bank_name" value={form.bank_name} onChange={handleChange} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
              <input name="bank_account" value={form.bank_account} onChange={handleChange} className="input-field" />
            </div>
          </div>
        </div>

        {isEdit && (
          <div className="card space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">Assigned classes and subjects</h2>
            <p className="text-sm text-gray-500">A teacher can be assigned to more than one class and subject.</p>
            {(teacherRecord?.assignments || []).length ? (
              <ul className="text-sm space-y-1">
                {teacherRecord.assignments.map((a: any) => (
                  <li key={a.id} className="flex justify-between border-b py-1">
                    <span>{a.class_name} · {a.subject_name}{a.session_name ? ` · ${a.session_name}` : ''}</span>
                    <button type="button" className="text-red-600 text-xs" onClick={async () => {
                      try {
                        await api.delete(`/teachers/${id}/assignments/${a.id}`);
                        toast.success('Assignment removed'); refetchTeacher();
                      } catch (error: any) { toast.error(error.response?.data?.error || error.message || 'Could not remove assignment'); }
                    }}>Remove</button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-gray-400">No classes or subjects assigned yet.</p>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Classes</label>
                <div className="max-h-36 overflow-y-auto border rounded-lg p-2 space-y-1">
                  {(Array.isArray(classes) ? classes : []).map((c: any) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={assignForm.class_ids.includes(c.id)} onChange={() => setAssignForm((f) => ({ ...f, class_ids: f.class_ids.includes(c.id) ? f.class_ids.filter((x) => x !== c.id) : [...f.class_ids, c.id] }))} />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Subjects</label>
                <div className="max-h-36 overflow-y-auto border rounded-lg p-2 space-y-1">
                  {availableSubjects.map((s: any) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={assignForm.subject_ids.includes(s.id)} onChange={() => setAssignForm((f) => ({ ...f, subject_ids: f.subject_ids.includes(s.id) ? f.subject_ids.filter((x) => x !== s.id) : [...f.subject_ids, s.id] }))} />
                      {s.name}
                    </label>
                  ))}
                  {!availableSubjects.length && <p className="text-xs text-gray-500">Select classes first. Subjects must be mapped to every selected class for this session in Academics.</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Session</label>
                <select className="input-field" value={assignForm.session_id} onChange={(e) => setAssignForm((f) => ({ ...f, session_id: e.target.value }))}>
                  <option value="">Current session</option>
                  {(Array.isArray(sessions) ? sessions : []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {assignForm.class_ids.length === 1 && <select aria-label="Assignment section" className="input-field mt-2" value={assignForm.section_id} onChange={event => setAssignForm(previous => ({ ...previous, section_id: event.target.value }))}>
                  <option value="">All sections</option>
                  {sections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}
                </select>}
                <button type="button" disabled={assigning || !assignForm.class_ids.length || !assignForm.subject_ids.length || !selectedSession} className="btn-primary mt-3" onClick={async () => {
                  setAssigning(true);
                  try {
                    const res = await api.post(`/teachers/${id}/assignments`, assignForm);
                    toast.success(res.data.message || 'Assigned');
                    setAssignForm({ class_ids: [], subject_ids: [], session_id: '', section_id: '' });
                    refetchTeacher();
                  } catch (err: any) {
                    toast.error(err.response?.data?.error || err.message || 'Failed to assign');
                  } finally { setAssigning(false); }
                }}>Assign selected</button>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate('/teachers')} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Saving...' : isEdit ? 'Update Teacher' : 'Add Teacher'}
          </button>
        </div>
      </form>
    </div>
  );
}
