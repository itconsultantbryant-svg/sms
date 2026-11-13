import { downloadDocument, escapeHtml } from '../../utils/printDocument';
import { ReactNode } from 'react';
import RecordDialog from './RecordDialog';

export type ViewField = { label: string; value: unknown };

export function fieldsFromRecord(record: any, labels: Record<string, string>): ViewField[] {
  return Object.entries(labels).map(([key, label]) => ({ label, value: record?.[key] }));
}

function display(value: unknown): string {
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) {
    if (!value.length) return '—';
    return value.map((item) => {
      if (item && typeof item === 'object') {
        const named = [item.first_name, item.last_name].filter(Boolean).join(' ');
        const teaching = [item.class_name, item.subject_name].filter(Boolean).join(' / ');
        return [named || item.name || teaching || item.description || item.fee_type_name || 'Record', item.admission_number, named ? item.class_name : null, item.relationship, item.session_name, item.section_name, item.phone, item.email].filter(Boolean).join(' · ');
      }
      return String(item);
    }).join(', ');
  }
  if (typeof value === 'object') return 'Details available in the linked record';
  return String(value);
}

export default function RecordView({
  title,
  fields,
  onClose,
  subtitle, photo, sections, actions, children,
}: {
  title: string;
  fields?: ViewField[];
  onClose: () => void;
  subtitle?: string; photo?: string | null; sections?: { title: string; fields: ViewField[] }[]; actions?: ReactNode; children?: ReactNode;
}) {
  const groups = sections || [{ title: 'Record information', fields: fields || [] }];
  const html = `
    ${photo && /^(https?:\/\/|data:image\/(png|jpeg|webp|gif);base64,)/i.test(photo) ? `<img src="${escapeHtml(photo)}" alt="Profile photo" style="width:110px;height:110px;object-fit:cover;border-radius:12px" />` : ''}
    <h1>${escapeHtml(title)}</h1>
    ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
    ${groups.map(group => `<h2>${escapeHtml(group.title)}</h2><table><tbody>${group.fields.map((field) => `<tr><th>${escapeHtml(field.label)}</th><td>${escapeHtml(display(field.value))}</td></tr>`).join('')}</tbody></table>`).join('')}
  `;

  return (
    <RecordDialog title={title} subtitle={subtitle} photo={photo} onClose={onClose} actions={actions}>
      {groups.map(group => <DetailSection key={group.title} title={group.title} fields={group.fields} />)}
      {children}
      <div className="flex justify-end"><button type="button" className="btn-primary text-sm" onClick={() => downloadDocument(title, html)}>Download details</button></div>
    </RecordDialog>
  );
}

export function DetailSection({ title, fields }: { title: string; fields: ViewField[] }) {
  return <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
    <h3 className="border-b border-gray-100 px-5 py-4 text-base font-semibold text-gray-900">{title}</h3>
    <dl className="grid grid-cols-1 gap-x-8 gap-y-5 p-5 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map(field => <div key={field.label} className="min-w-0"><dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{field.label}</dt>
        <dd className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-gray-900">{Array.isArray(field.value) && field.value.length
          ? <ul className="space-y-2">{field.value.map((item, index) => <li key={index} className="border-l-2 border-primary-100 pl-3">{display([item])}</li>)}</ul>
          : display(field.value)}</dd></div>)}
    </dl>
  </section>;
}
