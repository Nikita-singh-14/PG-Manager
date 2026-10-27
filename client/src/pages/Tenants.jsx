import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../utils/useFetch.js';
import { useToast } from '../toast.jsx';
import Async from '../components/Async.jsx';
import Badge from '../components/Badge.jsx';
import FormDialog from '../components/FormDialog.jsx';
import { inr, fmtDate } from '../utils/format.js';

export default function Tenants() {
  const state = useFetch('/tenants');
  const toast = useToast();
  const [dlg, setDlg] = useState(null);

  const addTenant = () => setDlg({
    title: 'Add tenant', submitLabel: 'Create tenant',
    intro: 'This also creates their login so they can see rent and raise complaints.',
    fields: [
      { name: 'name', label: 'Full name' },
      { name: 'email', label: 'Email (their login)', type: 'email' },
      { name: 'phone', label: 'Phone', type: 'tel' },
      { name: 'password', label: 'Initial password (min 8 characters)', type: 'password' },
    ],
    onSubmit: async (v) => { await api('POST', '/tenants', v); toast('Tenant created'); state.reload(); },
  });

  return (
    <>
      <div className="row between"><h1>Tenants</h1><button className="primary" onClick={addTenant}>+ Tenant</button></div>
      <Async state={state}>
        {(list) => (
          <div className="list">
            {list.map((t) => (
              <Link className="item" key={t.id} to={`/tenants/${t.id}`}>
                <div className="grow">
                  <strong>{t.name}</strong>
                  <div className="muted">{t.phone} · {t.stay ? `${t.stay.room}-${t.stay.bed} since ${fmtDate(t.stay.checkIn)}` : 'No bed assigned'}</div>
                </div>
                <div className="amt">
                  {t.outstanding > 0 ? <><strong>{inr(t.outstanding)}</strong><div className="muted">outstanding</div></> : <span className="muted">Settled</span>}
                </div>
                {t.overdue > 0 && <Badge status="Overdue" />}
              </Link>
            ))}
            {list.length === 0 && <div className="card muted">No tenants yet.</div>}
          </div>
        )}
      </Async>
      {dlg && <FormDialog {...dlg} onClose={() => setDlg(null)} />}
    </>
  );
}
