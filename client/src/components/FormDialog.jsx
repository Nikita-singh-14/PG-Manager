import { useEffect, useRef, useState } from 'react';

/**
 * Modal form driven by a `fields` config. Shows the server's error message and per-field messages
 * (err.fields) under the matching inputs. Closes itself after onSubmit resolves.
 * field: { name, label, type ('text'|'number'|'date'|'email'|'password'|'tel'|'select'|'textarea'), value, options, required, min, max }
 */
export default function FormDialog({ title, intro, fields, submitLabel = 'Save', onSubmit, onClose }) {
  const ref = useRef(null);
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.name, f.value ?? ''])));
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { ref.current?.showModal(); }, []);

  const set = (name, value) => setValues((v) => ({ ...v, [name]: value }));

  async function submit(e) {
    e.preventDefault();
    const clean = {};
    for (const f of fields) {
      const v = values[f.name];
      if (v !== '') clean[f.name] = f.type === 'number' ? Number(v) : v;
    }
    setFieldErrors({}); setFormError(''); setBusy(true);
    try {
      await onSubmit(clean);
      ref.current?.close();
    } catch (err) {
      setFieldErrors(err.fields || {});
      setFormError(err.message);
    } finally { setBusy(false); }
  }

  return (
    <dialog ref={ref} onClose={onClose}>
      <form noValidate onSubmit={submit}>
        <h2>{title}</h2>
        {intro && <div className="muted">{intro}</div>}
        {formError && <div className="form-error">{formError}</div>}
        {fields.map((f) => (
          <label key={f.name} className={fieldErrors[f.name] ? 'invalid' : ''}>
            {f.label}
            {f.type === 'select' ? (
              <select name={f.name} value={values[f.name]} onChange={(e) => set(f.name, e.target.value)}>
                {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea name={f.name} rows="3" maxLength="1000" value={values[f.name]} onChange={(e) => set(f.name, e.target.value)} />
            ) : (
              <input name={f.name} type={f.type || 'text'} value={values[f.name]} min={f.min} max={f.max}
                autoComplete={f.type === 'password' ? 'new-password' : undefined} onChange={(e) => set(f.name, e.target.value)} />
            )}
            {fieldErrors[f.name] && <span className="field-error">{fieldErrors[f.name]}</span>}
          </label>
        ))}
        <div className="actions">
          <button type="button" onClick={() => ref.current?.close()}>Cancel</button>
          <button className="primary" type="submit" disabled={busy}>{submitLabel}</button>
        </div>
      </form>
    </dialog>
  );
}
