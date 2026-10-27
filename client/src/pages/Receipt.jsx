import { useNavigate, useParams } from 'react-router-dom';
import { useFetch } from '../utils/useFetch.js';
import Async from '../components/Async.jsx';
import { inr, fmtDate, fmtMonth } from '../utils/format.js';

export default function Receipt() {
  const { id } = useParams();
  const navigate = useNavigate();
  const state = useFetch(`/payments/${id}/receipt`);
  return (
    <Async state={state}>
      {(r) => (
        <div className="receipt">
          <div className="card">
            <h1>Rent receipt</h1>
            <div className="muted">{r.receiptNo}</div>
            <dl>
              <dt>Received from</dt><dd>{r.tenant.name}</dd>
              <dt>Room / bed</dt><dd>{r.room}-{r.bed}</dd>
              <dt>For month</dt><dd>{fmtMonth(r.month)}</dd>
              <dt>Rent for month</dt><dd>{inr(r.rentForMonth)}{r.daysOccupied < r.daysInMonth ? ` (${r.daysOccupied}/${r.daysInMonth} days)` : ''}</dd>
              <dt>Paid on</dt><dd>{fmtDate(r.paidOn)} ({r.method})</dd>
              <dt><strong>Amount received</strong></dt><dd><strong>{inr(r.amount)}</strong></dd>
              <dt>Balance after this payment</dt><dd>{inr(r.balanceAfter)}</dd>
            </dl>
            {r.note && <div className="muted">Note: {r.note}</div>}
            <div className="row no-print mt">
              <button className="primary" onClick={() => window.print()}>Print / save as PDF</button>
              <button onClick={() => navigate(-1)}>Back</button>
            </div>
          </div>
        </div>
      )}
    </Async>
  );
}
