export const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');
export const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtMonth = (m) => new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
export const localToday = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in the browser's timezone
export const lastMonths = (count = 12) => {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
};
