import { RentRecord, Payment, Stay } from '../models.js';
import { ApiError } from '../errors.js';
import { config } from '../config.js';
import { prorateMonth } from '../lib/proration.js';
import { monthOf, monthsBetween, dueDateFor } from '../lib/dates.js';

/** Due / Paid / Overdue is derived, never stored, so it can't go stale as days pass. */
export function rentStatus({ amountDue, paid, dueDate }, today) {
  if (paid >= amountDue) return 'Paid';
  return dueDate < today ? 'Overdue' : 'Due';
}

/**
 * Make RentRecords for one stay match reality as of `today`. Idempotent and safe to run concurrently
 * (each month is an upsert on the unique (stay, month) index).
 *  - one record per month from check-in up to min(check-out, today)'s month, pro-rated
 *  - after a check-out: shrinks the last month; later months are deleted (or zeroed if money was already paid)
 */
export async function syncStayRent(stay, today) {
  const lastDay = stay.checkOut && stay.checkOut < today ? stay.checkOut : today;
  const wanted = monthsBetween(monthOf(stay.checkIn), monthOf(lastDay));
  for (const month of wanted) {
    const p = prorateMonth({ monthlyRate: stay.monthlyRent, month, checkIn: stay.checkIn, checkOut: stay.checkOut });
    const due = dueDateFor(month, config.rentDueDay);
    await RentRecord.updateOne(
      { stay: stay._id, month },
      {
        $set: { daysOccupied: p.daysOccupied, amountDue: p.amount },
        $setOnInsert: { tenant: stay.tenant, monthlyRate: stay.monthlyRent, daysInMonth: p.daysInMonth, dueDate: due > stay.checkIn ? due : stay.checkIn, paid: 0 },
      },
      { upsert: true },
    );
  }
  await RentRecord.deleteMany({ stay: stay._id, month: { $nin: wanted }, paid: 0 });
  await RentRecord.updateMany({ stay: stay._id, month: { $nin: wanted }, paid: { $gt: 0 } }, { $set: { daysOccupied: 0, amountDue: 0 } });
}

export async function syncAllRent(today) {
  for (const stay of await Stay.find({ checkIn: { $lte: today } })) await syncStayRent(stay, today);
}

const POPULATE = [{ path: 'tenant', select: 'name' }, { path: 'stay', populate: { path: 'bed', populate: 'room' } }];

async function decorate(rows, today, withPayments) {
  let byRent = new Map();
  if (withPayments && rows.length) {
    for (const p of await Payment.find({ rent: { $in: rows.map((r) => r._id) } }).sort({ _id: 1 })) {
      const k = String(p.rent);
      byRent.set(k, [...(byRent.get(k) || []), { id: p.id, amount: p.amount, paidOn: p.paidOn, method: p.method, note: p.note }]);
    }
  }
  return rows.map((r) => ({
    id: r.id, stayId: String(r.stay._id), tenantId: r.tenant.id, tenantName: r.tenant.name,
    room: r.stay.bed.room.name, bed: r.stay.bed.label, month: r.month,
    daysOccupied: r.daysOccupied, daysInMonth: r.daysInMonth, monthlyRate: r.monthlyRate,
    amountDue: r.amountDue, paid: r.paid, balance: r.amountDue - r.paid, outstanding: Math.max(0, r.amountDue - r.paid),
    dueDate: r.dueDate, status: rentStatus(r, today),
    ...(withPayments ? { payments: byRent.get(r.id) || [] } : {}),
  }));
}

export async function listRent({ month, status, tenantId, withPayments = false } = {}, today) {
  const filter = {};
  if (month) filter.month = month;
  if (tenantId) filter.tenant = tenantId;
  const rows = await RentRecord.find(filter).populate(POPULATE);
  const out = (await decorate(rows, today, withPayments))
    .sort((a, b) => b.month.localeCompare(a.month) || a.tenantName.localeCompare(b.tenantName));
  return status ? out.filter((r) => r.status === status) : out;
}

export async function getRent(id, today) {
  const row = await RentRecord.findById(id).populate(POPULATE);
  if (!row) throw new ApiError(404, 'Rent record not found');
  return (await decorate([row], today, true))[0];
}

export function balanceOf(rows) {
  return {
    outstanding: rows.reduce((a, r) => a + r.outstanding, 0),
    overdue: rows.filter((r) => r.status === 'Overdue').reduce((a, r) => a + r.outstanding, 0),
    credit: rows.reduce((a, r) => a + Math.max(0, -r.balance), 0),
  };
}
export const tenantBalance = async (tenantId, today) => balanceOf(await listRent({ tenantId }, today));
