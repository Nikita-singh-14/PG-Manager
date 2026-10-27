import { RentRecord, Payment, Tenant } from '../models.js';
import { ApiError } from '../errors.js';
import { getRent } from './rent.js';

/** Record a (possibly partial) payment. Over-payment is rejected, even under concurrent requests. */
export async function recordPayment({ rentId, amount, paidOn, method = 'cash', note = null, userId = null }, today) {
  const rent = await getRent(rentId, today); // 404 if missing
  if (paidOn > today) throw new ApiError(400, 'Payment date cannot be in the future.', { paidOn: 'Cannot be in the future' });
  if (rent.outstanding === 0) throw new ApiError(409, `${rent.month} rent for ${rent.tenantName} is already fully paid.`);
  if (amount > rent.outstanding) {
    throw new ApiError(422, `Payment of ₹${amount} is more than the outstanding ₹${rent.outstanding} for ${rent.month}.`, { amount: `Cannot exceed ₹${rent.outstanding}` });
  }
  // Atomic guard: increment `paid` only if it still won't exceed amountDue. Two simultaneous payments can't both slip through.
  const updated = await RentRecord.findOneAndUpdate(
    { _id: rentId, $expr: { $lte: [{ $add: ['$paid', amount] }, '$amountDue'] } },
    { $inc: { paid: amount } },
    { new: true },
  );
  if (!updated) throw new ApiError(422, 'The outstanding amount just changed. Please refresh and try again.', { amount: 'Outstanding changed' });
  let payment;
  try {
    payment = await Payment.create({ rent: rentId, amount, paidOn, method, note, recordedBy: userId });
  } catch (err) {
    await RentRecord.updateOne({ _id: rentId }, { $inc: { paid: -amount } }); // undo
    throw err;
  }
  return { paymentId: payment.id, rent: await getRent(rentId, today) };
}

export async function getReceipt(paymentId, today) {
  const p = await Payment.findById(paymentId);
  if (!p) throw new ApiError(404, 'Payment not found');
  const rent = await getRent(p.rent, today);
  const upToHere = rent.payments.filter((x) => x.id <= p.id).reduce((a, x) => a + x.amount, 0); // ObjectIds are time-ordered
  const t = await Tenant.findById(rent.tenantId, 'name email phone');
  return {
    receiptNo: `RCPT-${p.id.slice(-8).toUpperCase()}`,
    amount: p.amount, paidOn: p.paidOn, method: p.method, note: p.note,
    tenant: { name: t.name, email: t.email, phone: t.phone }, tenantId: rent.tenantId,
    room: rent.room, bed: rent.bed, month: rent.month, rentForMonth: rent.amountDue,
    daysOccupied: rent.daysOccupied, daysInMonth: rent.daysInMonth, balanceAfter: Math.max(0, rent.amountDue - upToHere),
  };
}
