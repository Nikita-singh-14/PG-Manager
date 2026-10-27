import { Link } from 'react-router-dom';
import { useFetch } from '../utils/useFetch.js';
import Async from '../components/Async.jsx';
import Badge from '../components/Badge.jsx';
import { inr, fmtDate, fmtMonth } from '../utils/format.js';

export default function Dashboard() {
  const state = useFetch('/dashboard');
  return (
    <Async state={state}>
      {(d) => (
        <>
          <h1>Dashboard <span className="muted">· {fmtMonth(d.month)}</span></h1>
          <div className="grid">
            <div className="card stat">
              <div className="muted">Beds filled</div>
              <div className="num">{d.occupancy.occupied} / {d.occupancy.total}</div>
              <progress max="100" value={d.occupancy.percent} />
              <div className="muted">{d.occupancy.percent}% occupancy</div>
            </div>
            <div className="card stat">
              <div className="muted">Collected this month</div>
              <div className="num">{inr(d.rent.collectedThisMonth)}</div>
              <div className="muted">of {inr(d.rent.expectedThisMonth)} billed</div>
            </div>
            <div className="card stat">
              <div className="muted">Outstanding this month</div>
              <div className="num">{inr(d.rent.outstandingThisMonth)}</div>
            </div>
            <div className="card stat">
              <div className="muted">Open complaints</div>
              <div className="num">{d.openComplaints}</div>
              <Link to="/complaints">View</Link>
            </div>
          </div>
          <h2>Overdue tenants ({d.overdueTenants.length})</h2>
          <div className="list">
            {d.overdueTenants.map((t) => (
              <Link className="item" key={t.tenantId} to={`/tenants/${t.tenantId}`}>
                <div className="grow">
                  <strong>{t.name}</strong>
                  <div className="muted">{t.room}-{t.bed} · overdue since {fmtDate(t.oldestDue)} · {t.months.length} month{t.months.length > 1 ? 's' : ''}</div>
                </div>
                <div className="amt"><strong>{inr(t.outstanding)}</strong></div>
                <Badge status="Overdue" />
              </Link>
            ))}
            {d.overdueTenants.length === 0 && <div className="card muted">Nobody is overdue 🎉</div>}
          </div>
        </>
      )}
    </Async>
  );
}
