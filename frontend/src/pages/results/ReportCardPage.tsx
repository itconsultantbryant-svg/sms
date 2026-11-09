import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import api from '../../utils/api';
import { openPrintDocument } from '../../utils/printDocument';
import { COMPANY_NAME, COMPANY_SHORT_NAME } from '../../utils/company';

export default function ReportCardPage() {
  const { studentId, examId } = useParams();

  const { data, isLoading } = useQuery<any>({
    queryKey: ['report-card', studentId, examId],
    queryFn: () => api.get(`/results/report-card/${studentId}/${examId}`).then(r => r.data),
  });

  if (isLoading) return <div className="text-center py-12 text-gray-400">Loading report card...</div>;
  if (!data) return <div className="text-center py-12 text-gray-400">Report card not found</div>;

  const { institution, student, result, subjects, gradeScale, attendance } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to={`/examinations/${examId}/results`} className="text-gray-400 hover:text-gray-600"><ArrowLeft size={20} /></Link>
          <h1 className="text-2xl font-bold text-gray-900">Report Card</h1>
        </div>
        <button onClick={() => openPrintDocument('Report card', document.getElementById('report-card')?.innerHTML || '')} className="btn-primary">
          <Printer size={16} className="mr-2" /> Preview / Download
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 print:shadow-none print:border-none" id="report-card">
        {/* Header */}
        <div className="text-center border-b-2 border-gray-900 pb-4 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 uppercase">{institution?.institution_name || institution?.name || `${COMPANY_SHORT_NAME} School Management`}</h2>
          <p className="text-sm text-gray-600">{institution?.address || ''}</p>
          <p className="text-sm text-gray-600">{institution?.email || ''} | {institution?.mobile || ''}</p>
          <p className="text-lg font-semibold text-primary-700 mt-2">STUDENT REPORT CARD</p>
        </div>

        {/* Student Info */}
        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div className="space-y-1">
            <p><span className="font-medium text-gray-600">Name:</span> {student.first_name} {student.middle_name || ''} {student.last_name}</p>
            <p><span className="font-medium text-gray-600">Admission #:</span> {student.admission_number}</p>
            <p><span className="font-medium text-gray-600">Class:</span> {student.class_name} {student.section_name ? `(${student.section_name})` : ''}</p>
          </div>
          <div className="space-y-1 text-right">
            <p><span className="font-medium text-gray-600">Exam:</span> {result?.exam_name}</p>
            <p><span className="font-medium text-gray-600">Term:</span> {result?.exam_type_name || '-'}</p>
            <p><span className="font-medium text-gray-600">Rank:</span> {result?.rank || '-'}</p>
          </div>
        </div>

        {/* Marks Table */}
        <table className="w-full text-sm border-collapse border border-gray-300 mb-6">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 py-2 px-3 text-left font-semibold">Subject</th>
              <th className="border border-gray-300 py-2 px-3 text-center font-semibold">Max Marks</th>
              <th className="border border-gray-300 py-2 px-3 text-center font-semibold">Marks Obtained</th>
              <th className="border border-gray-300 py-2 px-3 text-center font-semibold">Percentage</th>
              <th className="border border-gray-300 py-2 px-3 text-center font-semibold">Grade</th>
              <th className="border border-gray-300 py-2 px-3 text-center font-semibold">Remark</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s: any, i: number) => (
              <tr key={i} className={s.is_absent ? 'bg-red-50' : ''}>
                <td className="border border-gray-300 py-2 px-3 font-medium">{s.subject_name}</td>
                <td className="border border-gray-300 py-2 px-3 text-center">{s.max_marks}</td>
                <td className="border border-gray-300 py-2 px-3 text-center font-medium">
                  {s.is_absent ? 'Absent' : s.marks_obtained}
                </td>
                <td className="border border-gray-300 py-2 px-3 text-center">{s.is_absent ? '-' : `${s.percentage}%`}</td>
                <td className="border border-gray-300 py-2 px-3 text-center font-bold">{s.is_absent ? '-' : s.grade}</td>
                <td className="border border-gray-300 py-2 px-3 text-center text-gray-600">{s.remark}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 font-semibold">
              <td className="border border-gray-300 py-2 px-3">TOTAL</td>
              <td className="border border-gray-300 py-2 px-3 text-center">{result?.total_marks}</td>
              <td className="border border-gray-300 py-2 px-3 text-center">{result?.total_obtained}</td>
              <td className="border border-gray-300 py-2 px-3 text-center">{result?.percentage}%</td>
              <td className="border border-gray-300 py-2 px-3 text-center text-lg">{result?.grade}</td>
              <td className="border border-gray-300 py-2 px-3 text-center">
                <span className={result?.status === 'pass' ? 'text-green-700' : 'text-red-700'}>
                  {result?.status?.toUpperCase()}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Attendance */}
        {attendance && (
          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-2">Attendance Summary</h3>
            <div className="flex gap-6 text-sm">
              <p>Present: <span className="font-medium text-green-700">{attendance.present_days}</span></p>
              <p>Absent: <span className="font-medium text-red-700">{attendance.absent_days}</span></p>
              <p>Total: <span className="font-medium">{attendance.total_days}</span></p>
            </div>
          </div>
        )}

        {/* Grade Scale Reference */}
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 mb-2">Grading Scale</h3>
          <div className="flex flex-wrap gap-3 text-xs">
            {gradeScale.map((g: any) => (
              <span key={g.grade} className="px-2 py-1 bg-gray-100 rounded">
                {g.grade}: {g.min_percentage}-{g.max_percentage}% ({g.remark})
              </span>
            ))}
          </div>
        </div>

        {/* Comments */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">Class Teacher's Comment:</p>
            <div className="border-b border-gray-300 min-h-[40px] text-sm">{result?.teacher_comment || ''}</div>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">Principal's Comment:</p>
            <div className="border-b border-gray-300 min-h-[40px] text-sm">{result?.principal_comment || ''}</div>
          </div>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-3 gap-6 pt-8">
          <div className="text-center">
            <div className="border-t border-gray-400 pt-2">
              <p className="text-xs text-gray-500">Class Teacher</p>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-400 pt-2">
              <p className="text-xs text-gray-500">Principal</p>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-400 pt-2">
              <p className="text-xs text-gray-500">Parent/Guardian</p>
            </div>
          </div>
        </div>

        <div className="text-center mt-6 text-xs text-gray-400">
          Generated by {COMPANY_NAME} ({COMPANY_SHORT_NAME}) School Management System
        </div>
      </div>
    </div>
  );
}
