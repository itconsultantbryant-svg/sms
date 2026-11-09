import { useQuery } from '@tanstack/react-query';
import api from '../../utils/api';
import { escapeHtml, openPrintDocument } from '../../utils/printDocument';

export default function PortalFeesPage() {

  const { data, isLoading } = useQuery({
    queryKey: ['my-fees'],
    queryFn: () => api.get('/fees/mine').then((r) => r.data),
  });

  const invoices = data?.invoices || [];
  const payments = data?.payments || [];

  const printStatement = () => {
    openPrintDocument('Financial statement', `
      <h1>Financial statement</h1>
      <p class="meta">Invoices and payments</p>
      <h2>Invoices</h2>
      <table><thead><tr><th>Invoice</th><th>Student</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
      <tbody>${invoices.map((i: any) => `<tr><td>${escapeHtml(i.invoice_number)}</td><td>${escapeHtml(i.first_name)} ${escapeHtml(i.last_name)}</td><td>${Number(i.total_amount || 0).toFixed(2)}</td><td>${Number(i.paid_amount || 0).toFixed(2)}</td><td>${Number(i.balance || 0).toFixed(2)}</td><td>${escapeHtml(i.status)}</td></tr>`).join('')}</tbody></table>
      <h2>Payments</h2>
      <table><thead><tr><th>Receipt</th><th>Date</th><th>Amount</th><th>Method</th></tr></thead>
      <tbody>${payments.map((p: any) => `<tr><td>${escapeHtml(p.payment_number)}</td><td>${escapeHtml(p.payment_date)}</td><td>${Number(p.amount || 0).toFixed(2)}</td><td>${escapeHtml(p.payment_method)}</td></tr>`).join('')}</tbody></table>
    `);
  };

  if (isLoading) return <div className="p-8 text-center text-gray-500">Loading finances…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fees &amp; Payments</h1>
          <p className="text-sm text-gray-500">Invoices, balances, and payment history</p>
        </div>
        <button type="button" className="btn-secondary" onClick={printStatement}>Preview / Download PDF</button>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Payment verification</h2>
        <p className="text-sm text-gray-600">Contact your school's finance office to make a payment. Only authorized finance staff can verify and record payments. Online payment collection is not enabled.</p>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-2">Invoices</h2>
        <table className="min-w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b"><th className="py-2">Invoice</th><th>Student</th><th>Balance</th><th>Status</th></tr></thead>
          <tbody>
            {invoices.map((i: any) => (
              <tr key={i.id} className="border-b"><td className="py-2">{i.invoice_number}</td><td>{i.first_name} {i.last_name}</td><td>${Number(i.balance || 0).toFixed(2)}</td><td className="capitalize">{i.status}</td></tr>
            ))}
            {!invoices.length && <tr><td colSpan={4} className="py-6 text-center text-gray-400">No invoices</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-2">Payments</h2>
        <table className="min-w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b"><th className="py-2">Receipt</th><th>Date</th><th>Amount</th><th>Method</th></tr></thead>
          <tbody>
            {payments.map((p: any) => (
              <tr key={p.id} className="border-b"><td className="py-2">{p.payment_number}</td><td>{p.payment_date}</td><td>${Number(p.amount || 0).toFixed(2)}</td><td>{p.payment_method}</td></tr>
            ))}
            {!payments.length && <tr><td colSpan={4} className="py-6 text-center text-gray-400">No payments yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
