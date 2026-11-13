import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import api from '../../utils/api';
import { PaginatedResponse, Parent } from '../../types';
import RecordView from '../../components/common/RecordView';
import RecordActions from '../../components/common/RecordActions';
import { Link } from 'react-router-dom';
import PasswordReset from '../../components/common/PasswordReset';
import { fieldsFromRecord } from '../../components/common/RecordView';
import { RecordFeedback } from '../../components/common/RecordDialog';

export default function ParentsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [viewId, setViewId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<Parent>>({
    queryKey: ['parents', page, search],
    queryFn: () => api.get('/parents', { params: { page, limit: 20, search } }).then(r => r.data),
  });

  const { data: viewed, error: viewError } = useQuery<any>({
    queryKey: ['parent-view', viewId],
    queryFn: () => api.get(`/parents/${viewId}`).then((r) => r.data),
    enabled: !!viewId,
  });

  const totalPages = Math.ceil((data?.total || 0) / 20);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Parents</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.total || 0} parents total</p>
        </div>
      </div>

      <div className="card">
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search parents..."
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
                <th className="text-left py-3 px-3 font-medium text-gray-500">Name</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Relationship</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Phone</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Email</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Children</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Occupation</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="py-12 text-center text-gray-400">Loading...</td></tr>
              ) : data?.data.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-gray-400">No parents found</td></tr>
              ) : (
                data?.data.map((parent) => (
                  <tr key={parent.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-3 font-medium">{parent.first_name} {parent.last_name}</td>
                    <td className="py-3 px-3 capitalize">{parent.relationship || '-'}</td>
                    <td className="py-3 px-3">{parent.phone || '-'}</td>
                    <td className="py-3 px-3">{parent.email || '-'}</td>
                    <td className="py-3 px-3">{parent.children_count || 0}</td>
                    <td className="py-3 px-3">{parent.occupation || '-'}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <button type="button" className="text-primary-600 text-sm" onClick={() => setViewId(parent.id)}>View</button>
                        <Link className="text-primary-600" to={`/parents/${parent.id}/edit`}>Edit</Link>
                        <RecordActions resource="parents" id={parent.id} label={`${parent.first_name} ${parent.last_name}`} invalidate={['parents']} />
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
      {viewId && !viewed && <RecordFeedback title="Parent profile" error={viewError} onClose={() => setViewId(null)} />}
      {viewed && viewId && (
        <RecordView
          title={`${viewed.first_name || ''} ${viewed.last_name || ''}`.trim() || 'Parent'}
          subtitle={`Parent / guardian · ${viewed.children?.length || 0} linked students`}
          photo={viewed.photo}
          actions={<Link className="btn-primary" to={`/parents/${viewId}/edit`}>Edit parent details</Link>}
          onClose={() => setViewId(null)}
          sections={[
            { title: 'Personal and contact information', fields: fieldsFromRecord(viewed, { first_name: 'First name', last_name: 'Last name', relationship: 'Relationship', phone: 'Phone', email: 'Email', address: 'Address' }) },
            { title: 'Occupation and workplace', fields: fieldsFromRecord(viewed, { occupation: 'Occupation', workplace: 'Workplace' }) },
            { title: 'Linked students', fields: [{ label: 'Children', value: viewed.children }] },
          ]}>
          <PasswordReset key={viewId} resource="parents" id={viewId} username={viewed.username} />
        </RecordView>
      )}
    </div>
  );
}
