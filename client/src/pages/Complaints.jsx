import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useFetch } from '../utils/useFetch.js';
import { useToast } from '../toast.jsx';
import Async from '../components/Async.jsx';
import Badge from '../components/Badge.jsx';
import FormDialog from '../components/FormDialog.jsx';

const CATEGORIES = ['plumbing', 'electrical', 'cleaning', 'furniture', 'internet', 'other'];

export default function Complaints() {
  const { user } = useAuth();
  const owner = user.role === 'owner';
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const state = useFetch(`/complaints${status ? `?status=${status}` : ''}`);
  const toast = useToast();
  const [dlg, setDlg] = useState(null);

  const raise = () => setDlg({
    title: 'Raise a complaint', submitLabel: 'Submit',
    fields: [
      { name: 'category', label: 'Category', type: 'select', value: 'plumbing', options: CATEGORIES.map((c) => [c, c]) },
      { name: 'title', label: 'Short title' },
      { name: 'description', label: 'What is the problem?', type: 'textarea' },
    ],
    onSubmit: async (v) => { await api('POST', '/complaints', v); toast('Complaint sent to the owner'); state.reload(); },
  });

  const edit = (c) => setDlg({
    title: 'Update complaint',
    fields: [
      { name: 'status', label: 'Status', type: 'select', value: c.status, options: [['open', 'Open'], ['in_progress', 'In progress'], ['resolved', 'Resolved']] },
      { name: 'ownerNote', label: 'Note to tenant', type: 'textarea', value: c.ownerNote || '' },
    ],
    onSubmit: async (v) => { await api('PATCH', `/complaints/${c.id}`, v); toast('Complaint updated'); state.reload(); },
  });

  return (
    <>
      <div className="row between">
        <h1>Complaints</h1>
        {!owner && <button className="primary" onClick={raise}>+ Raise complaint</button>}
      </div>
      {owner && (
        <div className="filters">
          <select value={status} onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}>
            {[['', 'All'], ['open', 'Open'], ['in_progress', 'In progress'], ['resolved', 'Resolved']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      )}
      <Async state={state}>
        {(list) => (
          <div className="list">
            {list.map((c) => (
              <div className="item" key={c.id}>
                <div className="grow">
                  <strong>{c.title}</strong> <span className="muted">· {c.category}</span>
                  <div>{c.description}</div>
                  <div className="muted">{owner ? `${c.tenantName}${c.bed ? ` (${c.bed})` : ''} · ` : ''}{c.createdAt.slice(0, 10)}</div>
                  {c.ownerNote && <div className="muted">Owner: {c.ownerNote}</div>}
                </div>
                <Badge status={c.status} />
                {owner && <button className="small" onClick={() => edit(c)}>Update</button>}
              </div>
            ))}
            {list.length === 0 && <div className="card muted">No complaints.</div>}
          </div>
        )}
      </Async>
      {dlg && <FormDialog {...dlg} onClose={() => setDlg(null)} />}
    </>
  );
}
