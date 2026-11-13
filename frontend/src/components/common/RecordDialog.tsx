import { ReactNode, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export function ProfileHeader({ title, subtitle, photo }: { title: string; subtitle?: string; photo?: string | null }) {
  const [first, ...rest] = title.split(/\s+/);
  return <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
    {photo && /^(https?:\/\/|data:image\/(png|jpeg|webp|gif);base64,)/i.test(photo)
      ? <img src={photo} alt={`${title} profile`} className="h-28 w-28 shrink-0 rounded-2xl border-4 border-white object-cover shadow-sm" />
      : <div aria-label="Profile photo not provided" className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl bg-primary-100 text-3xl font-semibold text-primary-700">{first?.[0]}{rest[rest.length - 1]?.[0]}</div>}
    <div className="min-w-0 text-center sm:text-left"><h2 className="break-words text-2xl font-bold tracking-tight text-gray-900">{title}</h2>
      {subtitle && <p className="mt-2 break-words text-sm text-gray-600">{subtitle}</p>}</div>
  </div>;
}

export default function RecordDialog({ title, subtitle, photo, onClose, children, actions }: {
  title: string; subtitle?: string; photo?: string | null; onClose: () => void; children: ReactNode; actions?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; ref.current?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close.current(); }
      if (e.key !== 'Tab') return;
      const elements = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || []).filter(el => el.getClientRects().length);
      const first = elements[0]; const last = elements[elements.length - 1];
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, []);
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-3 sm:p-6">
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="mx-auto my-3 w-full max-w-5xl overflow-hidden rounded-2xl bg-gray-50 shadow-2xl outline-none sm:my-8">
      <header className="relative border-b border-gray-200 bg-gradient-to-br from-primary-50 to-white p-6 sm:p-8">
        <span id={titleId} className="sr-only">{title} details</span>
        <button type="button" aria-label="Close details" onClick={onClose} className="absolute right-4 top-4 rounded-lg bg-white p-2 text-gray-600 shadow-sm hover:text-gray-900 focus:ring-2 focus:ring-primary-500"><X size={20} /></button>
        <div className="pr-6"><ProfileHeader title={title} subtitle={subtitle} photo={photo} /></div>
        {actions && <div className="mt-5 flex flex-wrap gap-3">{actions}</div>}
      </header>
      <div className="space-y-6 p-4 sm:p-8">{children}</div>
      <footer className="flex justify-end border-t bg-white p-4 sm:px-8"><button type="button" className="btn-secondary" onClick={onClose}>Close</button></footer>
    </div>
  </div>;
}

export function RecordFeedback({ title, error, onClose }: { title: string; error: unknown; onClose: () => void }) {
  return <RecordDialog title={title} onClose={onClose}><p role={error ? 'alert' : 'status'} className={error ? 'text-red-700' : 'text-gray-500'}>{error ? 'Could not load this record. Check your access and connection, then try again.' : 'Loading complete record…'}</p></RecordDialog>;
}
