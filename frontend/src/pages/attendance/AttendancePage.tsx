import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import RecordActions from '../../components/common/RecordActions';
import { Class, Section, Student } from '../../types';

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [records, setRecords] = useState<Record<string, string>>({});
  const [showTake, setShowTake] = useState(false);
  const [viewSessionId, setViewSessionId] = useState<string | null>(null);

  const { data: classes } = useQuery<Class[]>({
    queryKey: ['classes'],
    queryFn: () => api.get('/academics/classes').then(r => r.data),
  });

  const { data: sections } = useQuery<Section[]>({
    queryKey: ['sections', classId],
    queryFn: () => api.get('/academics/sections', { params: { class_id: classId } }).then(r => r.data),
    enabled: !!classId,
  });

  const { data: students } = useQuery({
    queryKey: ['students-for-attendance', classId, sectionId],
    queryFn: () => api.get('/students', { params: { class: classId, section: sectionId, limit: 200 } }).then(r => r.data.data),
    enabled: !!classId && showTake,
  });

  const { data: attendanceSessions, isFetching } = useQuery({
    queryKey: ['attendance-sessions', classId, sectionId, date],
    queryFn: () => api.get('/attendance/sessions', {
      params: {
        class_id: classId || undefined,
        section_id: sectionId || undefined,
        date: date || undefined,
      },
    }).then(r => r.data),
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  const { data: sessionDetail, refetch: refetchDetail } = useQuery({
    queryKey: ['attendance-session', viewSessionId],
    queryFn: () => api.get(`/attendance/sessions/${viewSessionId}`).then(r => r.data),
    enabled: !!viewSessionId,
    refetchInterval: viewSessionId ? 10000 : false,
  });

  const takeMutation = useMutation({
    mutationFn: (data: any) => api.post('/attendance/take', data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['attendance-sessions'] });
      toast.success(response.data.offline ? 'Attendance saved on this device — pending synchronization' : 'Attendance saved successfully');
      setShowTake(false);
      setRecords({});
    },
    onError: (err: any) => toast.error(err.response?.data?.error || err.message || 'Failed to save attendance'),
  });

  const handleMarkAll = (status: string) => {
    if (!students) return;
    const newRecords: Record<string, string> = {};
    (students as Student[]).forEach(s => { newRecords[s.id] = status; });
    setRecords(newRecords);
  };

  const handleSubmit = () => {
    const attendanceRecords = Object.entries(records).map(([student_id, status]) => ({ student_id, status }));
    if (attendanceRecords.length === 0) {
      toast.error('Please mark attendance for at least one student');
      return;
    }
    takeMutation.mutate({
      class_id: classId,
      section_id: sectionId || undefined,
      date,
      type: 'class',
      records: attendanceRecords,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
        <p className="text-sm text-gray-500 mt-1">Record attendance and watch class records update live{isFetching ? ' · refreshing…' : ''}</p>
      </div>

      <div className="card">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Class *</label>
            <select value={classId} onChange={e => { setClassId(e.target.value); setSectionId(''); }} className="input-field">
              <option value="">All classes</option>
              {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
            <select value={sectionId} onChange={e => setSectionId(e.target.value)} className="input-field">
              <option value="">All Sections</option>
              {sections?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <button
            onClick={() => setShowTake(true)}
            disabled={!classId}
            className="btn-primary"
          >
            Take Attendance
          </button>
        </div>
      </div>

      {showTake && students && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Mark Attendance - {date}</h2>
            <div className="flex gap-2">
              <button onClick={() => handleMarkAll('present')} className="btn-secondary text-xs px-2 py-1">All Present</button>
              <button onClick={() => handleMarkAll('absent')} className="btn-secondary text-xs px-2 py-1">All Absent</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-3 font-medium text-gray-500">#</th>
                  <th className="text-left py-3 px-3 font-medium text-gray-500">Student</th>
                  <th className="text-center py-3 px-3 font-medium text-green-600">Present</th>
                  <th className="text-center py-3 px-3 font-medium text-red-600">Absent</th>
                  <th className="text-center py-3 px-3 font-medium text-yellow-600">Late</th>
                  <th className="text-center py-3 px-3 font-medium text-blue-600">Excused</th>
                </tr>
              </thead>
              <tbody>
                {(students as Student[]).map((student, idx) => (
                  <tr key={student.id} className="border-b border-gray-100">
                    <td className="py-2 px-3 text-gray-500">{idx + 1}</td>
                    <td className="py-2 px-3 font-medium">{student.first_name} {student.last_name}</td>
                    {['present', 'absent', 'late', 'excused'].map(status => (
                      <td key={status} className="py-2 px-3 text-center">
                        <input
                          type="radio"
                          name={`attendance-${student.id}`}
                          checked={records[student.id] === status}
                          onChange={() => setRecords(prev => ({ ...prev, [student.id]: status }))}
                          className="w-4 h-4"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3 mt-4 pt-4 border-t">
            <button onClick={() => { setShowTake(false); setRecords({}); }} className="btn-secondary">Cancel</button>
            <button onClick={handleSubmit} disabled={takeMutation.isPending} className="btn-primary">
              {takeMutation.isPending ? 'Saving...' : 'Save Attendance'}
            </button>
          </div>
        </div>
      )}

      {!showTake && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Attendance Records</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-3 font-medium text-gray-500">Date</th>
                  <th className="text-left py-3 px-3 font-medium text-gray-500">Class</th>
                  <th className="text-left py-3 px-3 font-medium text-gray-500">Section</th>
                  <th className="text-left py-3 px-3 font-medium text-gray-500">Teacher</th>
                  <th className="text-center py-3 px-3 font-medium text-green-600">Present</th>
                  <th className="text-center py-3 px-3 font-medium text-red-600">Absent</th>
                  <th className="text-center py-3 px-3 font-medium text-yellow-600">Late</th>
                  <th className="text-left py-3 px-3 font-medium text-gray-500">Total</th>
                  <th className="text-left py-3 px-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!(attendanceSessions as any[])?.length ? (
                  <tr><td colSpan={9} className="py-12 text-center text-gray-400">No attendance records yet</td></tr>
                ) : (attendanceSessions as any[]).map((session: any) => (
                  <tr key={session.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-3">{session.date}</td>
                    <td className="py-3 px-3">{session.class_name}</td>
                    <td className="py-3 px-3">{session.section_name || '-'}</td>
                    <td className="py-3 px-3">{session.teacher_name || '-'}</td>
                    <td className="py-3 px-3 text-center text-green-600 font-medium">{session.present_count}</td>
                    <td className="py-3 px-3 text-center text-red-600 font-medium">{session.absent_count}</td>
                    <td className="py-3 px-3 text-center text-yellow-600 font-medium">{session.late_count}</td>
                    <td className="py-3 px-3">{session.total_count}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <button type="button" className="text-primary-600 text-sm" onClick={() => setViewSessionId(session.id)}>View</button>
                        <RecordActions resource="attendance" id={session.id} label={`${session.date} attendance`} invalidate={['attendance-sessions']} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewSessionId && sessionDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">{sessionDetail.class_name} · {sessionDetail.date}</h3>
                <p className="text-sm text-gray-500">Teacher: {sessionDetail.teacher_name || '—'} · live detail</p>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary text-sm" onClick={() => refetchDetail()}>Refresh</button>
                <button type="button" className="btn-secondary text-sm" onClick={() => setViewSessionId(null)}>Close</button>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-2">Student</th>
                  <th className="text-left py-2 px-2">Admission #</th>
                  <th className="text-left py-2 px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {(sessionDetail.records || []).map((row: any) => (
                  <tr key={row.id} className="border-b border-gray-100">
                    <td className="py-2 px-2">{row.first_name} {row.last_name}</td>
                    <td className="py-2 px-2">{row.admission_number}</td>
                    <td className="py-2 px-2 capitalize">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
