export default function Badge({ status }) {
  return <span className={`badge ${String(status).toLowerCase()}`}>{String(status).replace('_', ' ')}</span>;
}
