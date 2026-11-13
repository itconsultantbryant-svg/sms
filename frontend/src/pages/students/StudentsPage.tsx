import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search, Edit2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import RecordActions from '../../components/common/RecordActions';
import GradesheetView, { printGradesheet, GradesheetData } from '../../components/gradesheet/GradesheetView';
import { PaginatedResponse, Student, Class, Branch } from '../../types';
import RecordView, { fieldsFromRecord } from '../../components/common/RecordView';
import PasswordReset from '../../components/common/PasswordReset';
import { RecordFeedback } from '../../components/common/RecordDialog';

export default function StudentsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [viewId, setViewId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<GradesheetData | null>(null);

  const { data: studentsData, isLoading } = useQuery<PaginatedResponse<Student>>({
    queryKey: ['students', page, search, classFilter, branchFilter],
    queryFn: () => api.get('/students', {
      params: { page, limit: 20, search, class: classFilter, branch: branchFilter }
    }).then(r => r.data),
  });

  const { data: classes } = useQuery<Class[]>({
    queryKey: ['classes'],
    queryFn: () => api.get('/academics/classes').then(r => r.data),
  });

  const { data: branches } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches').then(r => r.data),
  });

  const { data: viewed, error: viewError } = useQuery<any>({
    queryKey: ['student-view', viewId],
    queryFn: () => api.get(`/students/${viewId}`).then((r) => r.data),
    enabled: !!viewId,
  });

  const totalPages = Math.ceil((studentsData?.total || 0) / 20);

  const openGradesheet = async (mode: 'term' | 'year', termId?: string) => {
    if (!viewId) return;
    try {
      const res = await api.get(`/gradebook/gradesheet/${viewId}`, {
        params: { mode, term_id: termId || undefined },
      });
      setSheet(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not load gradesheet');
    }
  };

  const openPriorFile = async (recordId: string) => {
    if (!viewId) return;
    try {
      const res = await api.get(`/students/${viewId}/prior-records/${recordId}/file`);
      const data = res.data;
      if (!data?.file_data) {
        toast.error('No file attached');
        return;
      }
      if (String(data.mime_type || '').includes('json')) {
        try {
          setSheet(JSON.parse(data.file_data));
          return;
        } catch {
          // fall through to download
        }
      }
      const link = document.createElement('a');
      link.href = data.file_data;
      link.download = data.file_name || 'student-record';
      link.click();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not open file');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Students</h1>
          <p className="text-sm text-gray-500 mt-1">
            {studentsData?.total || 0} students total
          </p>
        </div>
        <Link to="/students/new" className="btn-primary">
          <Plus size={16} className="mr-2" />
          New Admission
        </Link>
      </div>

      <div className="card">
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search students..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="input-field pl-9"
            />
          </div>
          <select
            value={branchFilter}
            onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }}
            className="input-field w-auto"
          >
            <option value="">All Branches</option>
            {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select
            value={classFilter}
            onChange={(e) => { setClassFilter(e.target.value); setPage(1); }}
            className="input-field w-auto"
          >
            <option value="">All Classes</option>
            {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-3 font-medium text-gray-500">Admission #</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Name</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Class</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Section</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Gender</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Status</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="py-12 text-center text-gray-400">Loading...</td></tr>
              ) : studentsData?.data.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-gray-400">No students found</td></tr>
              ) : (
                studentsData?.data.map((student) => (
                  <tr key={student.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-3 font-medium text-primary-600">{student.admission_number}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        {student.photo ? (
                          <img src={student.photo} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium">
                            {student.first_name[0]}{student.last_name[0]}
                          </div>
                        )}
                        {student.first_name} {student.last_name}
                      </div>
                    </td>
                    <td className="py-3 px-3">{student.class_name || '-'}</td>
                    <td className="py-3 px-3">{student.section_name || '-'}</td>
                    <td className="py-3 px-3 capitalize">{student.gender || '-'}</td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        student.status === 'active' ? 'bg-green-100 text-green-700' :
                        student.status === 'graduated' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {student.status}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-3">
                        <button type="button" className="text-primary-600 text-sm" onClick={() => { setSheet(null); setViewId(student.id); }}>View</button>
                        <RecordActions resource="students" id={student.id} label={`${student.first_name} ${student.last_name}`} invalidate={['students']} />
                        <Link to={`/students/${student.id}/edit`} className="text-gray-400 hover:text-primary-600">
                          <Edit2 size={15} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary text-sm px-3 py-1"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-secondary text-sm px-3 py-1"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {viewId && !viewed && <RecordFeedback title="Student profile" error={viewError} onClose={() => setViewId(null)} />}
      {viewed && viewId && (
        <RecordView title={[viewed.first_name, viewed.middle_name, viewed.last_name].filter(Boolean).join(' ')}
          subtitle={`${viewed.admission_number} · ${viewed.class_name || 'No class assigned'} · ${viewed.status || 'Student'}`} photo={viewed.photo}
          onClose={() => { setViewId(null); setSheet(null); }}
          actions={<Link to={`/students/${viewId}/edit`} className="btn-primary">Edit student details</Link>}
          sections={[
            { title: 'Personal information', fields: fieldsFromRecord(viewed, { first_name: 'First name', middle_name: 'Middle name', last_name: 'Last name', date_of_birth: 'Date of birth', gender: 'Gender', nationality: 'Nationality', county: 'County' }) },
            { title: 'Contact information', fields: fieldsFromRecord(viewed, { phone: 'Phone', email: 'Email', address: 'Address' }) },
            { title: 'Academic and admission information', fields: fieldsFromRecord(viewed, { admission_number: 'Admission number', admission_date: 'Admission date', branch_name: 'Branch', class_name: 'Class', section_name: 'Section', session_name: 'Academic session', previous_school: 'Previous school', previous_class: 'Previous class', status: 'Status' }) },
            { title: 'Health information', fields: fieldsFromRecord(viewed, { blood_group: 'Blood group', medical_info: 'Medical information' }) },
            ...(viewed.parents || []).map((parent: any, index: number) => ({ title: `Parent / guardian ${index + 1}${parent.is_primary ? ' (primary)' : ''}`, fields: fieldsFromRecord(parent, { first_name: 'First name', last_name: 'Last name', relationship: 'Relationship', phone: 'Phone', email: 'Email', address: 'Address', occupation: 'Occupation', workplace: 'Workplace' }) })),
          ]}>
              <PasswordReset key={viewId} resource="students" id={viewId} username={viewed.username} />
              <section>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <h3 className="font-medium text-gray-900">Gradesheets</h3>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-secondary text-sm" onClick={() => openGradesheet('year')}>Yearly gradesheet</button>
                    {(viewed.available_terms || []).slice(0, 4).map((term: any) => (
                      <button key={term.id} type="button" className="btn-secondary text-sm" onClick={() => openGradesheet('term', term.id)}>
                        {term.name}
                      </button>
                    ))}
                  </div>
                </div>
                {sheet ? (
                  <div className="border rounded-lg p-3">
                    <div className="flex justify-end mb-2">
                      <button type="button" className="btn-primary text-sm" onClick={() => printGradesheet(sheet)}>Download PDF</button>
                    </div>
                    <GradesheetView sheet={sheet} />
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Preview a term or yearly gradesheet above.</p>
                )}
              </section>
              <section>
                <h3 className="font-medium text-gray-900 mb-2">Transfer / prior records</h3>
                {(viewed.prior_records || []).length ? (
                  <div className="space-y-2">
                    {viewed.prior_records.map((record: any) => (
                      <div key={record.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                        <div>
                          <p className="font-medium text-gray-900">{record.title || record.record_type}</p>
                          <p className="text-gray-500 capitalize">{String(record.record_type || '').replace(/_/g, ' ')}
                            {record.class_name ? ` · ${record.class_name}` : ''}
                            {record.school_name ? ` · ${record.school_name}` : ''}
                           </p>
                           {record.session_name && <p className="text-gray-500">{record.session_name}</p>}
                           {record.notes && <p className="mt-1 text-gray-700">{record.notes}</p>}
                        </div>
                        {record.has_file ? (
                          <button type="button" className="text-primary-600" onClick={() => openPriorFile(record.id)}>
                            {String(record.mime_type || '').includes('json') ? 'Preview' : 'Download'}
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No transfer transcripts or prior class gradesheets on file.</p>
                )}
              </section>
        </RecordView>
      )}
    </div>
  );
}
