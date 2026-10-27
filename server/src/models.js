import mongoose from 'mongoose';
const { Schema } = mongoose;
const ref = (model, extra = {}) => ({ type: Schema.Types.ObjectId, ref: model, ...extra });

// Dates are 'YYYY-MM-DD' strings (they sort correctly as text and have no timezone problems).
// Money is whole rupees (integers).

/**
 * bookings[] on a Bed (and on a Tenant) lists the date ranges already claimed.
 * Claiming a range is ONE atomic findOneAndUpdate on that single document (see services/stays.js),
 * which is how double-booking is prevented without transactions / triggers.
 * `to` is '9999-12-31' for a stay with no check-out date yet.
 */
const bookingSchema = new Schema({
  stay: { type: Schema.Types.ObjectId, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
}, { _id: false });

const Room = mongoose.model('Room', (() => {
  const s = new Schema({
    name: { type: String, required: true, trim: true },
    floor: { type: Number, default: 0 },
    notes: { type: String, default: null },
  });
  s.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } }); // case-insensitive unique
  return s;
})());

const Bed = mongoose.model('Bed', (() => {
  const s = new Schema({
    room: ref('Room', { required: true }),
    label: { type: String, required: true, trim: true },
    monthlyRent: { type: Number, required: true, min: 1 },
    bookings: { type: [bookingSchema], default: [] },
  });
  s.index({ room: 1, label: 1 }, { unique: true });
  return s;
})());

const Tenant = mongoose.model('Tenant', (() => {
  const s = new Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    phone: { type: String, required: true },
    bookings: { type: [bookingSchema], default: [] },
  }, { timestamps: true });
  return s;
})());

const User = mongoose.model('User', new Schema({
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['owner', 'tenant'], required: true },
  tenant: ref('Tenant', { default: null }),
}, { timestamps: true }));

/** One tenant in one bed. checkOut = LAST day occupied (inclusive); null = still here. */
const Stay = mongoose.model('Stay', (() => {
  const s = new Schema({
    tenant: ref('Tenant', { required: true }),
    bed: ref('Bed', { required: true }),
    checkIn: { type: String, required: true },
    checkOut: { type: String, default: null },
    open: { type: Boolean, default: true },            // true until checked out
    monthlyRent: { type: Number, required: true, min: 1 }, // snapshot: later bed price changes don't alter it
    deposit: { type: Number, default: 0, min: 0 },
    depositRefund: { type: Number, default: null },
    deductions: { type: [new Schema({ reason: String, amount: { type: Number, min: 1 } }, { _id: false })], default: [] },
  }, { timestamps: true });
  // Extra backstop: at most one open stay per bed / per tenant, enforced by MongoDB itself.
  s.index({ bed: 1 }, { unique: true, partialFilterExpression: { open: true } });
  s.index({ tenant: 1 }, { unique: true, partialFilterExpression: { open: true } });
  return s;
})());

/** One row per stay per month. `paid` is a running total kept in sync atomically by payments. Status is derived, never stored. */
const RentRecord = mongoose.model('RentRecord', (() => {
  const s = new Schema({
    stay: ref('Stay', { required: true }),
    tenant: ref('Tenant', { required: true }),
    month: { type: String, required: true },
    monthlyRate: { type: Number, required: true },
    daysOccupied: { type: Number, required: true },
    daysInMonth: { type: Number, required: true },
    amountDue: { type: Number, required: true, min: 0 },
    paid: { type: Number, default: 0, min: 0 },
    dueDate: { type: String, required: true },
  });
  s.index({ stay: 1, month: 1 }, { unique: true });
  s.index({ month: 1 });
  return s;
})());

const Payment = mongoose.model('Payment', new Schema({
  rent: ref('RentRecord', { required: true, index: true }),
  amount: { type: Number, required: true, min: 1 },
  paidOn: { type: String, required: true },
  method: { type: String, enum: ['cash', 'upi', 'bank', 'card', 'other'], default: 'cash' },
  note: { type: String, default: null },
  recordedBy: ref('User', { default: null }),
}, { timestamps: true }));

const Complaint = mongoose.model('Complaint', new Schema({
  tenant: ref('Tenant', { required: true, index: true }),
  category: { type: String, enum: ['plumbing', 'electrical', 'cleaning', 'furniture', 'internet', 'other'], required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' },
  ownerNote: { type: String, default: null },
}, { timestamps: true }));

export { Room, Bed, Tenant, User, Stay, RentRecord, Payment, Complaint };
