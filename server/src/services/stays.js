import mongoose from 'mongoose';
import { Bed, Tenant, Stay, RentRecord } from '../models.js';
import { ApiError } from '../errors.js';
import { OPEN_END } from '../lib/dates.js';
import { syncStayRent } from './rent.js';

/**
 * Atomically claim [from, to] on a Bed or Tenant document.
 * Mongo guarantees a single-document findOneAndUpdate is atomic: the "no overlapping booking" condition
 * and the $push happen as ONE operation, so two concurrent requests can never both succeed.
 * Returns the updated doc, or null if the range overlaps an existing booking (or doc missing).
 */
async function claim(Model, id, stayId, from, to) {
  return Model.findOneAndUpdate(
    { _id: id, bookings: { $not: { $elemMatch: { from: { $lte: to }, to: { $gte: from } } } } },
    { $push: { bookings: { stay: stayId, from, to } } },
    { new: true },
  );
}
const release = (Model, id, stayId) => Model.updateOne({ _id: id }, { $pull: { bookings: { stay: stayId } } });

async function bedConflictError(bedId, date) {
  const bed = await Bed.findById(bedId).populate('room');
  const b = bed?.bookings.find((x) => x.from <= OPEN_END && x.to >= date);
  const stay = b && (await Stay.findById(b.stay).populate('tenant', 'name'));
  const label = bed ? `${bed.room.name}-${bed.label}` : '';
  const msg = b
    ? `Bed ${label} is already occupied by ${stay?.tenant?.name ?? 'another tenant'} (from ${b.from}, ${b.to === OPEN_END ? 'with no check-out date' : 'until ' + b.to}).`
    : `Bed ${label} was just taken. Please refresh and try again.`;
  return new ApiError(409, msg, { bedId: 'Bed is not available' });
}

async function tenantConflictError(tenant, date) {
  const fresh = await Tenant.findById(tenant._id);
  const b = fresh?.bookings.find((x) => x.from <= OPEN_END && x.to >= date);
  const stay = b && (await Stay.findById(b.stay).populate({ path: 'bed', populate: 'room' }));
  const where = stay?.bed ? ` (${stay.bed.room.name}-${stay.bed.label})` : '';
  return new ApiError(409, `${tenant.name} already has a bed${where}${b ? ' from ' + b.from : ''}. Check them out first.`, { tenantId: 'Tenant already has a bed' });
}

function mapDbError(err) {
  if (err?.code === 11000) {
    const key = JSON.stringify(err.keyPattern || {});
    if (key.includes('bed')) return new ApiError(409, 'This bed is already taken.', { bedId: 'Bed is not available' });
    if (key.includes('tenant')) return new ApiError(409, 'This tenant already has a bed.', { tenantId: 'Tenant already has a bed' });
  }
  return err;
}

export function shapeStay(s) {
  return {
    id: s.id, tenantId: s.tenant.id ?? String(s.tenant), tenantName: s.tenant.name ?? undefined,
    bedId: s.bed.id ?? String(s.bed), bed: s.bed.label, room: s.bed.room?.name,
    checkIn: s.checkIn, checkOut: s.checkOut, monthlyRent: s.monthlyRent, deposit: s.deposit,
    depositRefund: s.depositRefund, deductions: s.deductions.map((d) => ({ reason: d.reason, amount: d.amount })),
  };
}
export const getStay = async (id) => {
  const s = await Stay.findById(id).populate('tenant', 'name').populate({ path: 'bed', populate: 'room' });
  if (!s) throw new ApiError(404, 'Stay not found');
  return shapeStay(s);
};

/**
 * Check a tenant in. Steps (no multi-document transaction needed, so it works on any MongoDB):
 *   1. atomically claim the bed's date range           -> 409 if taken
 *   2. atomically claim the tenant's date range        -> 409 (and undo step 1) if they already have a bed
 *   3. create the Stay                                 -> on failure undo 1 and 2
 * If the process crashes between steps, releaseOrphanBookings() cleans up on next start.
 */
export async function checkIn({ tenantId, bedId, checkIn: date, monthlyRent, deposit = 0 }, today) {
  const [tenant, bed] = await Promise.all([Tenant.findById(tenantId), Bed.findById(bedId)]);
  if (!tenant) throw new ApiError(404, 'Tenant not found', { tenantId: 'Tenant not found' });
  if (!bed) throw new ApiError(404, 'Bed not found', { bedId: 'Bed not found' });

  const stayId = new mongoose.Types.ObjectId();
  if (!(await claim(Bed, bed._id, stayId, date, OPEN_END))) throw await bedConflictError(bed._id, date);
  if (!(await claim(Tenant, tenant._id, stayId, date, OPEN_END))) {
    await release(Bed, bed._id, stayId);
    throw await tenantConflictError(tenant, date);
  }
  try {
    await Stay.create({ _id: stayId, tenant: tenant._id, bed: bed._id, checkIn: date, monthlyRent: monthlyRent ?? bed.monthlyRent, deposit });
  } catch (err) {
    await Promise.all([release(Bed, bed._id, stayId), release(Tenant, tenant._id, stayId)]);
    throw mapDbError(err);
  }
  await syncStayRent(await Stay.findById(stayId), today);
  return getStay(stayId);
}

/** Check out. `date` is the last day the tenant uses the bed (inclusive). Refund = deposit - deductions. */
export async function checkOut(stayId, { checkOut: date, deductions = [] }, today) {
  const stay = await Stay.findById(stayId);
  if (!stay) throw new ApiError(404, 'Stay not found');
  if (!stay.open) throw new ApiError(409, `This stay already ended on ${stay.checkOut}.`);
  if (date < stay.checkIn) throw new ApiError(400, `Check-out can't be before check-in (${stay.checkIn}).`, { checkOut: 'Must be on or after check-in' });
  const total = deductions.reduce((a, d) => a + d.amount, 0);
  if (total > stay.deposit) throw new ApiError(400, `Deductions (₹${total}) exceed the deposit (₹${stay.deposit}).`, { deductions: 'Total exceeds deposit' });

  // Guarded update: only one concurrent check-out can flip open -> false.
  const updated = await Stay.findOneAndUpdate(
    { _id: stayId, open: true },
    { $set: { checkOut: date, open: false, depositRefund: stay.deposit - total, deductions } },
    { new: true },
  );
  if (!updated) throw new ApiError(409, 'This stay was just checked out. Please refresh.');

  const shorten = { $set: { 'bookings.$.to': date } };
  await Promise.all([
    Bed.updateOne({ _id: stay.bed, 'bookings.stay': stay._id }, shorten),
    Tenant.updateOne({ _id: stay.tenant, 'bookings.stay': stay._id }, shorten),
  ]);
  await syncStayRent(updated, today); // re-prorates the last month, drops later months

  const rows = await RentRecord.find({ stay: stayId });
  const outstandingRent = rows.reduce((a, r) => a + Math.max(0, r.amountDue - r.paid), 0);
  return { ...(await getStay(stayId)), outstandingRent };
}

/** Remove bookings whose Stay was never created (e.g. server crashed mid check-in). Run at startup. */
export async function releaseOrphanBookings() {
  let removed = 0;
  for (const Model of [Bed, Tenant]) {
    for (const doc of await Model.find({ 'bookings.0': { $exists: true } })) {
      const ids = doc.bookings.map((b) => b.stay);
      const existing = new Set((await Stay.find({ _id: { $in: ids } }, '_id')).map((s) => String(s._id)));
      const orphans = ids.filter((id) => !existing.has(String(id)));
      if (orphans.length) { await Model.updateOne({ _id: doc._id }, { $pull: { bookings: { stay: { $in: orphans } } } }); removed += orphans.length; }
    }
  }
  return removed;
}
