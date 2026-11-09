import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import DocumentActions from '../../components/common/DocumentActions';
import { useSchool } from '../../hooks/useSchool';
import { SchoolDoc } from '../../utils/schoolDocument';

export default function GradebookEntryPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: school } = useSchool();
  const isAdmin = user?.user_type === 'institution_admin' || user?.user_type === 'platform_admin';
  const [scores, setScores] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setDirty(false); setScores({}); }, [id]);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['gradebook', id],
    queryFn: () => api.get(`/gradebook/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  useEffect(() => {
    if (!data?.entries || dirty) return;
    const map: Record<string, string> = {};
    for (const e of data.entries) {
      map[`${e.student_id}:${e.column_id}`] = e.score == null ? '' : String(e.score);
    }
    setScores(map);
  }, [data, dirty]);

  const totalsByStudent = useMemo(() => {
    const m: Record<string, any> = {};
    for (const t of data?.totals || []) m[t.student_id] = t;
    return m;
  }, [data]);

  const canEdit = data && ['open', 'draft', 'rejected'].includes(data.status);

  const save = async () => {
    if (!data) return false;
    setSaving(true);
    try {
      const entries = Object.entries(scores).map(([key, value]) => {
        const [student_id, column_id] = key.split(':');
        return {
          student_id,
          column_id,
          score: value === '' ? null : Number(value),
        };
      });
      const response = await api.put(`/gradebook/${id}/entries`, { entries });
      toast.success(response.data.offline ? 'Scores saved on this device — pending synchronization' : 'Scores saved');
      if (!response.data.offline) { await refetch(); setDirty(false); }
      return !response.data.offline;
    } catch (e: any) {
      toast.error(e.response?.data?.error || e.message || 'Save failed');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    try {
      if (!await save()) {
        toast.error('Synchronize the saved scores before submitting for approval');
        return;
      }
      await api.post(`/gradebook/${id}/submit`);
      toast.success('Submitted for admin approval');
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Submit failed');
    }
  };

  const gradebookDoc = (): SchoolDoc => {
    const cols = data.columns || [];
    return {
      title: 'GRADEBOOK',
      filename: `${data.subject_name || 'gradebook'}-${data.class_name || 'class'}.pdf`.replace(/\s+/g, '-').toLowerCase(),
      school: school || {},
      subtitle: `${data.subject_name || ''} — ${data.class_name || ''}`,
      meta: [
        { label: 'Term', value: data.term_name || '' },
        { label: 'Status', value: data.status || '' },
      ],
      columns: ['Student', ...cols.map((c: any) => `${c.name} (${c.weight}%)`), 'Total %', 'Grade'],
      rows: (data.students || []).map((s: any) => {
        const total = totalsByStudent[s.id];
        return [
          `${s.last_name}, ${s.first_name}`,
          ...cols.map((c: any) => scores[`${s.id}:${c.id}`] || ''),
          total?.computed_percent ?? '',
          total?.letter_grade ?? '',
        ];
      }),
    };
  };

  const approve = async () => {
    try {
      await api.post(`/gradebook/${id}/approve`);
      toast.success('Approved');
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Approve failed');
    }
  };

  if (isLoading || !data) {
    return <div className="p-8 text-center text-gray-500">Loading gradebook…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to={user?.user_type === 'teacher' ? '/teacher/gradebook' : '/gradebook'} className="text-sm text-primary-600">← Back</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">
            {data.subject_name} — {data.class_name}
          </h1>
          <p className="text-sm text-gray-500">
            {data.term_name || 'Term'} · Status: <span className="capitalize font-medium">{data.status}</span>
            {data.rejection_reason ? ` · ${data.rejection_reason}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <>
              <button type="button" className="btn-secondary" onClick={save} disabled={saving}>Save</button>
              <button type="button" className="btn-primary" onClick={submit}>Submit for approval</button>
            </>
          )}
          {data ? <DocumentActions doc={gradebookDoc()} className="flex gap-2 print:hidden" /> : null}
          {isAdmin && data.status === 'submitted' && (
            <button type="button" className="btn-primary" onClick={approve}>Approve</button>
          )}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2 pr-3 sticky left-0 bg-white">Student</th>
              {(data.columns || []).map((c: any) => (
                <th key={c.id} className="py-2 px-2 whitespace-nowrap">
                  {c.name}
                  <div className="text-xs font-normal text-gray-400">{c.weight}% / {c.max_score}</div>
                </th>
              ))}
              <th className="py-2 pl-2">Total %</th>
              <th className="py-2">Grade</th>
            </tr>
          </thead>
          <tbody>
            {(data.students || []).map((s: any) => {
              const total = totalsByStudent[s.id];
              return (
                <tr key={s.id} className="border-b border-gray-50">
                  <td className="py-2 pr-3 sticky left-0 bg-white whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {s.photo ? (
                        <img src={s.photo} alt="" className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gray-200" />
                      )}
                      <div>
                        <div className="font-medium">{s.last_name}, {s.first_name}</div>
                        <div className="text-xs text-gray-400">{s.admission_number}</div>
                      </div>
                    </div>
                  </td>
                  {(data.columns || []).map((c: any) => {
                    const key = `${s.id}:${c.id}`;
                    return (
                      <td key={c.id} className="py-1 px-2">
                        <input
                          type="number"
                          disabled={!canEdit}
                          className="input-field w-20 py-1"
                          value={scores[key] ?? ''}
                          max={c.max_score}
                          min={0}
                          onChange={(e) => { setDirty(true); setScores((prev) => ({ ...prev, [key]: e.target.value })); }}
                        />
                      </td>
                    );
                  })}
                  <td className="py-2 pl-2 font-medium">{total?.computed_percent ?? '—'}</td>
                  <td className="py-2">{total?.letter_grade ?? '—'}</td>
                </tr>
              );
            })}
            {!(data.students || []).length && (
              <tr><td colSpan={10} className="py-8 text-center text-gray-400">No students in this class</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
