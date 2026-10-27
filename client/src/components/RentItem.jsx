import { Link } from 'react-router-dom';
import Badge from './Badge.jsx';
import { inr, fmtDate, fmtMonth } from '../utils/format.js';

export default function RentItem({ r, showTenant = false, onPay }) {
  return (
    <div className="item">
      <div className="grow">
        <strong>{showTenant ? `${r.tenantName} · ` : ''}{fmtMonth(r.month)}</strong>
        <div className="muted">
          {r.room}-{r.bed} · {r.daysOccupied === r.daysInMonth ? 'full month' : `${r.daysOccupied}/${r.daysInMonth} days (pro-rated)`} · due {fmtDate(r.dueDate)}
        </div>
      </div>
      <div className="amt">
        <div>{inr(r.amountDue)} <span className="muted">billed</span></div>
        <div className="muted">paid {inr(r.paid)}</div>
        {r.balance > 0 && <strong>balance {inr(r.balance)}</strong>}
        {r.balance < 0 && <span className="muted">credit {inr(-r.balance)}</span>}
      </div>
      <Badge status={r.status} />
      {onPay && r.outstanding > 0 && <button className="small primary" onClick={() => onPay(r)}>Record payment</button>}
      {r.payments?.length > 0 && (
        <div className="subpay">
          {r.payments.map((p) => (
            <div className="row between" key={p.id}>
              <span>{fmtDate(p.paidOn)} · {p.method} · {inr(p.amount)}{p.note ? ` · ${p.note}` : ''}</span>
              <Link to={`/receipt/${p.id}`}>Receipt</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
