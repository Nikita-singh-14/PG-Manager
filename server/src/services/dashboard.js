import { Bed, Stay, Payment, Complaint } from '../models.js';
import { listRent } from './rent.js';
import { monthOf, monthStart, monthEnd } from '../lib/dates.js';

export async function dashboard(today) {
  const month = monthOf(today);
  const [totalBeds, occupiedIds, collectedAgg, thisMonth, overdueRows, openComplaints] = await Promise.all([
    Bed.countDocuments(),
    Stay.distinct('bed', { checkIn: { $lte: today }, $or: [{ checkOut: null }, { checkOut: { $gte: today } }] }),
    Payment.aggregate([{ $match: { paidOn: { $gte: monthStart(month), $lte: monthEnd(month) } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    listRent({ month }, today),
    listRent({ status: 'Overdue' }, today),
    Complaint.countDocuments({ status: { $ne: 'resolved' } }),
  ]);
  const overdue = new Map();
  for (const r of overdueRows) {
    const e = overdue.get(r.tenantId) || { tenantId: r.tenantId, name: r.tenantName, room: r.room, bed: r.bed, outstanding: 0, months: [], oldestDue: r.dueDate };
    e.outstanding += r.outstanding; e.months.push(r.month);
    if (r.dueDate < e.oldestDue) e.oldestDue = r.dueDate;
    overdue.set(r.tenantId, e);
  }
  const occupied = occupiedIds.length;
  return {
    month, today,
    occupancy: { occupied, total: totalBeds, percent: totalBeds ? Math.round((occupied / totalBeds) * 100) : 0 },
    rent: { collectedThisMonth: collectedAgg[0]?.total ?? 0, expectedThisMonth: thisMonth.reduce((a, r) => a + r.amountDue, 0), outstandingThisMonth: thisMonth.reduce((a, r) => a + r.outstanding, 0) },
    overdueTenants: [...overdue.values()].sort((a, b) => b.outstanding - a.outstanding),
    openComplaints,
  };
}
