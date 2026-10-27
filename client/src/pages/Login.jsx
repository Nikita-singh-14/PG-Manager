import { useState } from 'react';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try { await login(form.email, form.password); }
    catch (err) { setError(err.message); setBusy(false); }
  }
  const fill = (email, password) => setForm({ email, password });

  return (
    <div className="login">
      <div className="card">
        <h1>🏠 PG Manager</h1>
        <p className="muted">Sign in to manage your PG or view your rent.</p>
        <form noValidate onSubmit={submit}>
          {error && <div className="form-error">{error}</div>}
          <label>Email<input type="email" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Password<input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <button className="primary" type="submit" disabled={busy}>Sign in</button>
        </form>
        <div className="demo">
          <span className="muted">Demo:</span>
          <button className="small" type="button" onClick={() => fill('owner@pg.test', 'Owner@123')}>Owner</button>
          <button className="small" type="button" onClick={() => fill('tenant1@pg.test', 'Tenant@123')}>Tenant</button>
        </div>
      </div>
    </div>
  );
}
