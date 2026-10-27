import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../utils/useFetch.js';
import { useToast } from '../toast.jsx';
import Async from '../components/Async.jsx';
import Badge from '../components/Badge.jsx';
import FormDialog from '../components/FormDialog.jsx';
import { inr, fmtDate, localToday } from '../utils/format.js';

export default function Rooms() {
  const state = useFetch('/rooms');
  const toast = useToast();
  const [dlg, setDlg] = useState(null);
  const done = (msg) => { toast(msg); state.reload(); };

  const addRoom = () => setDlg({
    title: 'Add room', submitLabel: 'Create room',
    fields: [
      { name: 'name', label: 'Room name / number' },
      { name: 'floor', label: 'Floor', type: 'number', value: 1 },
      { name: 'bedCount', label: 'Number of beds', type: 'number', value: 2, min: 1, max: 12 },
      { name: 'monthlyRent', label: 'Rent per bed (₹/month)', type: 'number', min: 1 },
      { name: 'notes', label: 'Notes (optional)' },
    ],
    onSubmit: async (v) => { await api('POST', '/rooms', v); done('Room added'); },
  });

  const addBed = (room) => setDlg({
    title: `Add bed to room ${room.name}`,
    fields: [{ name: 'label', label: 'Bed label (e.g. C)' }, { name: 'monthlyRent', label: 'Rent (₹/month)', type: 'number', min: 1 }],
    onSubmit: async (v) => { await api('POST', `/rooms/${room.id}/beds`, v); done('Bed added'); },
  });

  async function startCheckIn(room, bed) {
    try {
      const tenants = (await api('GET', '/tenants')).filter((t) => !t.stay);
      if (!tenants.length) return toast('Every tenant already has a bed. Add a tenant first.', true);
      setDlg({
        title: `Check in to ${room.name}-${bed.label}`, submitLabel: 'Check in',
        fields: [
          { name: 'tenantId', label: 'Tenant', type: 'select', options: tenants.map((t) => [t.id, t.name]), value: tenants[0].id },
          { name: 'checkIn', label: 'Check-in date', type: 'date', value: localToday() },
          { name: 'monthlyRent', label: 'Monthly rent (₹)', type: 'number', value: bed.monthlyRent, min: 1 },
          { name: 'deposit', label: 'Security deposit (₹)', type: 'number', value: 0, min: 0 },
        ],
        onSubmit: async (v) => { await api('POST', '/stays', { ...v, bedId: bed.id }); done('Checked in. Rent record created.'); },
      });
    } catch (e) { toast(e.message, true); }
  }

  const startCheckOut = (occ) => setDlg({
    title: `Check out ${occ.name}`, submitLabel: 'Check out',
    intro: 'The check-out date is the last day they use the bed (it is charged). Final month rent is re-calculated automatically. Add deposit deductions if any.',
    fields: [
      { name: 'checkOut', label: 'Last day in bed', type: 'date', value: localToday() },
      { name: 'r1', label: 'Deduction 1 reason' }, { name: 'a1', label: 'Deduction 1 amount (₹)', type: 'number', min: 1 },
      { name: 'r2', label: 'Deduction 2 reason' }, { name: 'a2', label: 'Deduction 2 amount (₹)', type: 'number', min: 1 },
    ],
    onSubmit: async (v) => {
      const deductions = [[v.r1, v.a1], [v.r2, v.a2]].filter(([r, a]) => r || a).map(([reason, amount]) => ({ reason, amount }));
      const out = await api('POST', `/stays/${occ.stayId}/checkout`, { checkOut: v.checkOut, deductions });
      done(`Checked out. Deposit refund ${inr(out.depositRefund)}${out.outstandingRent ? ` · unpaid rent ${inr(out.outstandingRent)}` : ''}`);
    },
  });

  return (
    <>
      <div className="row between"><h1>Rooms &amp; beds</h1><button className="primary" onClick={addRoom}>+ Room</button></div>
      <Async state={state}>
        {(rooms) => (
          <>
            {rooms.map((room) => (
              <div className="card block" key={room.id}>
                <div className="row between">
                  <h3>Room {room.name} <span className="muted">· floor {room.floor}{room.notes ? ` · ${room.notes}` : ''}</span></h3>
                  <button className="small" onClick={() => addBed(room)}>+ Bed</button>
                </div>
                <div className="beds">
                  {room.beds.map((b) => (
                    <div key={b.id} className={`bed ${b.occupant ? '' : 'vacant'}`}>
                      <div className="row between"><strong>Bed {b.label}</strong><Badge status={b.occupant ? 'Occupied' : 'Vacant'} /></div>
                      <div className="muted">{inr(b.monthlyRent)}/month</div>
                      {b.occupant && (
                        <>
                          <div>
                            <Link to={`/tenants/${b.occupant.tenantId}`}>{b.occupant.name}</Link>
                            <div className="muted">since {fmtDate(b.occupant.since)}{b.occupant.until ? ` · leaves ${fmtDate(b.occupant.until)}` : ''}</div>
                          </div>
                          {!b.occupant.until && <button className="small" onClick={() => startCheckOut(b.occupant)}>Check out</button>}
                        </>
                      )}
                      {b.upcoming.map((u) => <div className="muted" key={u.stayId}>Next: {u.name} from {fmtDate(u.since)}</div>)}
                      {(!b.occupant || b.occupant.until) && <button className="small primary" onClick={() => startCheckIn(room, b)}>Check in</button>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {rooms.length === 0 && <div className="card muted">No rooms yet. Add your first room.</div>}
          </>
        )}
      </Async>
      {dlg && <FormDialog {...dlg} onClose={() => setDlg(null)} />}
    </>
  );
}
