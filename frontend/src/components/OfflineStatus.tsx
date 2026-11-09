import { useEffect, useState } from 'react';
import { offlineIdentity, synchronize, offlineConnection, offlineReadinessWarning } from '../offline/client';
import { OfflineOperation, operations, storeDelete, storeWrite } from '../offline/storage';

export default function OfflineStatus() {
  const [online, setOnline] = useState(!offlineConnection());
  const [rows, setRows] = useState<OfflineOperation[]>([]);
  const [storageError, setStorageError] = useState(false);
  const [warning, setWarning] = useState(offlineReadinessWarning());
  useEffect(() => {
    const refresh = () => {
      setOnline(!offlineConnection());
      setWarning(offlineReadinessWarning());
      const identity = offlineIdentity();
      if (!identity) { setRows([]); return; }
      operations(identity.owner).then(setRows).catch(() => setStorageError(true));
    };
    refresh();
    window.addEventListener('afrimind:offline-changed', refresh);
    window.addEventListener('svl:user-changed', refresh);
    const timer = window.setInterval(refresh, 5000);
    return () => { clearInterval(timer); window.removeEventListener('afrimind:offline-changed', refresh); window.removeEventListener('svl:user-changed', refresh); };
  }, []);
  if (online && !rows.length && !storageError && !warning) return null;
  return (
    <section aria-live="polite" className="border-b border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-testid="offline-status">
      <strong>{online ? (rows.length ? 'Synchronization status' : 'Offline readiness') : 'Offline mode'}</strong>
      {warning && <p>{warning}</p>}
      <p>{storageError ? 'Device storage is unavailable. Offline saves cannot be guaranteed.' : `${rows.length} saved change(s) on this device waiting for synchronization or review.`}</p>
      {!online && <p>Previously downloaded pages are available for up to 24 hours. Attendance, gradebook scores and teacher assignments can be saved locally. Payments, approvals, account changes and other actions need a connection.</p>}
      {rows.length > 0 && <details className="mt-2">
        <summary>Review saved changes</summary>
        <p>Do not clear browser data or change devices until pending work is synchronized. A rejected/conflicting save stays here; it is never silently overwritten.</p>
        <button type="button" className="btn-secondary mt-2 mr-2" onClick={() => { void synchronize(); }}>Retry synchronization</button>
        <button type="button" className="btn-secondary mt-2" onClick={() => {
          const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob); const link = document.createElement('a');
          link.href = url; link.download = 'afrimind-unsynchronized-changes.json'; link.click(); URL.revokeObjectURL(url);
        }}>Download my saved changes</button>
        <ul className="mt-2 space-y-2">{rows.map(row => <li key={row.id}>
          <span>{row.method.toUpperCase()} {row.url}: {row.status} {row.error || ''}</span>
          {row.status === 'rejected' && <button type="button" className="ml-3 underline" onClick={async () => {
            await storeWrite('outbox', { ...row, status: 'pending', error: undefined });
            window.dispatchEvent(new Event('afrimind:offline-changed')); void synchronize();
          }}>Retry saved request</button>}
          {row.status !== 'pending' && <button type="button" className="ml-3 underline" onClick={async () => {
            if (!confirm('Only discard after downloading/re-entering this saved change. Permanently remove it from this device?')) return;
            await storeDelete('outbox', row.id); window.dispatchEvent(new Event('afrimind:offline-changed'));
          }}>Discard saved change</button>}
        </li>)}</ul>
      </details>}
    </section>
  );
}
