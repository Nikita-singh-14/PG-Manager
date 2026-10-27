import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../utils/useFetch.js';
import { useToast } from '../toast.jsx';
import Async from '../components/Async.jsx';
import RentItem from '../components/RentItem.jsx';
import { usePaymentDialog } from './TenantDetail.jsx';
import { inr, fmtMonth, lastMonths } from '../utils/format.js';

export default function Rent() {
  const [params, setParams] = useSearchParams();
  const months = lastMonths(12);
  const month = params.get('month') ?? months[0];
  const status = params.get('status') ?? '';
  const qs = new URLSearchParams({ ...(month ? { month } : {}), ...(status ? { status } : {}) });
  const state = useFetch(`/rent?${qs}`);
  const toast = useToast();
  const [openPay, payDialog] = usePaymentDialog(state.reload);

  const setFilter = (key, value) => { const p = new URLSearchParams(params); p.set(key, value); if (key === 'status' && !p.has('month')) p.set('month', month); setParams(p); };
  const generate = async () => {
    try { await api('POST', '/rent/generate'); toast('Rent records are up to date'); state.reload(); } catch (e) { toast(e.message, true); }
  };

  return (
    <>
      <div className="row between"><h1>Monthly rent</h1><button className="small" onClick={generate}>Generate rent</button></div>
      <div className="filters">
        <select value={month} onChange={(e) => setFilter('month', e.target.value)}>
          <option value="">All months</option>
          {months.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
        </select>
        <select value={status} onChange={(e) => setFilter('status', e.target.value)}>
          {['', 'Due', 'Overdue', 'Paid'].map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
      </div>
      <Async state={state}>
        {(rows) => (
          <>
            <div className="muted mb">{rows.length} record{rows.length === 1 ? '' : 's'} · outstanding {inr(rows.reduce((a, r) => a + r.outstanding, 0))}</div>
            <div className="list">
              {rows.map((r) => <RentItem key={r.id} r={r} showTenant onPay={openPay} />)}
              {rows.length === 0 && <div className="card muted">No rent records match.</div>}
            </div>
          </>
        )}
      </Async>
      {payDialog}
    </>
  );
}
