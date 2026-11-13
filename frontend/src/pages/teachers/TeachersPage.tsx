import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search, Edit2 } from 'lucide-react';
import api from '../../utils/api';
import { PaginatedResponse, Employee } from '../../types';
import RecordView, { fieldsFromRecord } from '../../components/common/RecordView';
import PasswordReset from '../../components/common/PasswordReset';
import { RecordFeedback } from '../../components/common/RecordDialog';
import RecordActions from '../../components/common/RecordActions';

export default function TeachersPage({ staff = false }: { staff?: boolean }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [viewId, setViewId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<Employee>>({
    queryKey: [staff ? 'staff' : 'teachers', page, search],
    queryFn: () => api.get('/teachers', { params: { page, limit: 20, search, staff: staff ? 1 : undefined } }).then(r => r.data),
  });

  const { data: viewed, error: viewError } = useQuery<any>({
    queryKey: ['employee-view', viewId],
    queryFn: () => api.get(`/teachers/${viewId}`).then((r) => r.data),
    enabled: !!viewId,
  });

  const totalPages = Math.ceil((data?.total || 0) / 20);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{staff ? 'Staff' : 'Teachers'}</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.total || 0} {staff ? 'staff' : 'teachers'} total</p>
        </div>
        {!staff && <Link to="/teachers/new" className="btn-primary">
          <Plus size={16} className="mr-2" />
          Add Teacher
        </Link>}
      </div>

      <div className="card">
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search teachers..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="input-field pl-9"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-3 font-medium text-gray-500">Employee ID</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Name</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Department</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Designation</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Phone</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Branch</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="py-12 text-center text-gray-400">Loading...</td></tr>
              ) : data?.data.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-gray-400">No teachers found</td></tr>
              ) : (
                data?.data.map((teacher) => (
                  <tr key={teacher.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-3 font-medium text-primary-600">{teacher.employee_id}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        {teacher.photo ? (
                          <img src={teacher.photo} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-xs font-medium text-green-700">
                            {teacher.first_name[0]}{teacher.last_name[0]}
                          </div>
                        )}
                        {teacher.first_name} {teacher.last_name}
                      </div>
                    </td>
                    <td className="py-3 px-3">{teacher.department_name || '-'}</td>
                    <td className="py-3 px-3">{teacher.designation_name || '-'}</td>
                    <td className="py-3 px-3">{teacher.phone || '-'}</td>
                    <td className="py-3 px-3">{teacher.branch_name || '-'}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-3">
                        <button type="button" className="text-primary-600 text-sm" onClick={() => setViewId(teacher.id)}>View</button>
                        <RecordActions resource={staff ? 'staff' : 'teachers'} id={teacher.id} label={`${teacher.first_name} ${teacher.last_name}`} invalidate={['teachers']} />
                        <Link to={`/teachers/${teacher.id}/edit`} className="text-gray-400 hover:text-primary-600">
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
            <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary text-sm px-3 py-1">Previous</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-secondary text-sm px-3 py-1">Next</button>
            </div>
          </div>
        )}
      </div>
      {viewId && !viewed && <RecordFeedback title="Teacher profile" error={viewError} onClose={() => setViewId(null)} />}
      {viewed && viewId && (
        <RecordView
          title={`${viewed.first_name || ''} ${viewed.last_name || ''}`.trim() || (staff ? 'Staff' : 'Teacher')}
          subtitle={`${viewed.employee_id} · ${viewed.designation_name || (staff ? 'Staff member' : 'Teacher')}`}
          photo={viewed.photo}
          actions={!staff ? <Link className="btn-primary" to={`/teachers/${viewId}/edit`}>Edit teacher details</Link> : undefined}
          onClose={() => setViewId(null)}
          sections={[
            { title: 'Personal information', fields: fieldsFromRecord(viewed, { first_name: 'First name', middle_name: 'Middle name', last_name: 'Last name', gender: 'Gender', date_of_birth: 'Date of birth' }) },
            { title: 'Contact information', fields: fieldsFromRecord(viewed, { phone: 'Phone', email: 'Email', address: 'Address' }) },
            { title: 'Employment and qualifications', fields: [...fieldsFromRecord(viewed, { employee_id: 'Employee ID', department_name: 'Department', designation_name: 'Designation', branch_name: 'Branch', qualification: 'Qualification', experience: 'Experience', employment_date: 'Employment date', employment_type: 'Employment type' }), { label: 'Status', value: viewed.is_active ? 'Active' : 'Inactive' }] },
            ...(viewed.basic_salary !== undefined ? [{ title: 'Authorized financial information', fields: fieldsFromRecord(viewed, { basic_salary: 'Basic salary', bank_name: 'Bank name', bank_account: 'Bank account' }) }] : []),
            { title: 'Teaching assignments', fields: [{ label: 'Classes, subjects and sessions', value: viewed.assignments }] },
          ]}>
          {!staff && <PasswordReset key={viewId} resource="teachers" id={viewId} username={viewed.username} />}
        </RecordView>
      )}
    </div>
  );
}
