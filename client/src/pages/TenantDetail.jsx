import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../utils/useFetch.js';
import { useToast } from '../toast.jsx';
import Async from '../components/Async.jsx';
import FormDialog from '../components/FormDialog.jsx';
import RentItem from '../components/RentItem.jsx';
import { inr, fmtDate, fmtMonth, localToday } from '../utils/format.js';

export function usePaymentDialog(reload) {
  const toast = useToast();
  const [dlg, setDlg] = useState(null);
  const openPay = (r) => setDlg({
    title: 'Record payment', submitLabel: 'Save payment',
    intro: `${r.tenantName} – ${fmtMonth(r.month)} — outstanding ${inr(r.outstanding)}`,
    fields: [
      { name: 'amount', label: 'Amount (₹) — part payments are fine', type: 'number', value: r.outstanding, min: 1 },
      { name: 'paidOn', label: 'Paid on', type: 'date', value: localToday(), max: localToday() },
      { name: 'method', label: 'Method', type: 'select', value: 'upi', options: [['cash', 'Cash'], ['upi', 'UPI'], ['bank', 'Bank transfer'], ['card', 'Card'], ['other', 'Other']] },
      { name: 'note', label: 'Note (optional)' },
    ],
    onSubmit: async (v) => { await api('POST', `/rent/${r.id}/payments`, v); toast('Payment recorded'); reload(); },
  });
  const dialog = dlg && <FormDialog {...dlg} onClose={() => setDlg(null)} />;
  return [openPay, dialog];
}

export default function TenantDetail() {
  const { id } = useParams();
  const state = useFetch(`/tenants/${id}`);
  const [openPay, payDialog] = usePaymentDialog(state.reload);
  return (
    <>
      <p><Link to="/tenants">← Tenants</Link></p>
      <Async state={state}>
        {(t) => (
          <>
            <h1>{t.name}</h1>
            <div className="card">
              <div>{t.email} · {t.phone}</div>
              <div className="muted">
                {t.stay ? `Currently in ${t.stay.room}-${t.stay.bed} since ${fmtDate(t.stay.checkIn)}, deposit ${inr(t.stay.deposit)}` : 'No bed assigned'}
              </div>
              <div className="mt">
                <strong>Outstanding {inr(t.balance.outstanding)}</strong>
                {t.balance.overdue > 0 && <span className="muted"> ({inr(t.balance.overdue)} overdue)</span>}
                {t.balance.credit > 0 && <span className="muted"> · credit {inr(t.balance.credit)}</span>}
              </div>
            </div>
            <h2>Stays</h2>
            <div className="list">
              {t.stays.map((s) => (
                <div className="card" key={s.id}>
                  <strong>{s.room}-{s.bed}</strong> · {fmtDate(s.checkIn)} → {s.checkOut ? fmtDate(s.checkOut) : 'present'}
                  <div className="muted">
                    Deposit {inr(s.deposit)}{s.checkOut ? ` · refunded ${inr(s.depositRefund)}` : ''}
                    {s.deductions.map((d, i) => <span key={i}> · −{inr(d.amount)} {d.reason}</span>)}
                  </div>
                </div>
              ))}
              {t.stays.length === 0 && <div className="muted">No stays.</div>}
            </div>
            <h2>Rent history</h2>
            <div className="list">
              {t.rent.map((r) => <RentItem key={r.id} r={r} onPay={openPay} />)}
              {t.rent.length === 0 && <div className="muted">No rent records yet.</div>}
            </div>
          </>
        )}
      </Async>
      {payDialog}
    </>
  );
}
