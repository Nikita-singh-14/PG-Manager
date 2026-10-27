/** Render children(data) once loaded; show loading / error states otherwise. */
export default function Async({ state, children }) {
  if (state.error) return <div className="form-error">{state.error.message}</div>;
  if (!state.data) return <div className="muted center">Loading…</div>;
  return children(state.data);
}
