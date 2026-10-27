import { useFetch } from '../utils/useFetch.js';
import Async from '../components/Async.jsx';
import RentItem from '../components/RentItem.jsx';
import { inr } from '../utils/format.js';

export default function MyRent() {
  const state = useFetch('/me/rent');
  return (
    <>
      <h1>My rent</h1>
      <Async state={state}>
        {(d) => (
          <>
            <div className="grid">
              <div className="card stat"><div className="muted">Outstanding</div><div className="num">{inr(d.balance.outstanding)}</div></div>
              <div className="card stat"><div className="muted">Overdue</div><div className="num">{inr(d.balance.overdue)}</div></div>
            </div>
            <h2>History</h2>
            <div className="list">
              {d.rent.map((r) => <RentItem key={r.id} r={r} />)}
              {d.rent.length === 0 && <div className="card muted">No rent records yet — you have not been checked in.</div>}
            </div>
          </>
        )}
      </Async>
    </>
  );
}
