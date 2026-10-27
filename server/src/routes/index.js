import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { User, Tenant } from '../models.js';
import { ApiError } from '../errors.js';
import { auth } from '../middleware/auth.js';
import { validate, rules as v, idParam } from '../validate.js';
import { todayIn } from '../lib/dates.js';
import { listRooms, createRoom, addBed, updateBedRent } from '../services/rooms.js';
import { createTenant, listTenants, getTenantDetail } from '../services/tenants.js';
import { checkIn, checkOut, getStay } from '../services/stays.js';
import { listRent, syncAllRent, tenantBalance } from '../services/rent.js';
import { recordPayment, getReceipt } from '../services/payments.js';
import { listComplaints, createComplaint, updateComplaint } from '../services/complaints.js';
import { dashboard } from '../services/dashboard.js';

const CATEGORIES = ['plumbing', 'electrical', 'cleaning', 'furniture', 'internet', 'other'];
const STATUSES = ['open', 'in_progress', 'resolved'];
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

/** Wrap an async handler: its return value is sent as JSON, thrown errors go to the error middleware. */
const h = (fn, status = 200) => async (req, res, next) => {
  try { const out = await fn(req); res.status(status).json(out ?? { ok: true }); } catch (e) { next(e); }
};

export function buildRoutes(config) {
  const r = Router();
  const owner = auth(config, 'owner'), tenant = auth(config, 'tenant'), any = auth(config, 'any');
  const mx = 1_000_000;

  r.use((req, res, next) => { req.today = todayIn(config.timezone); res.set('Cache-Control', 'no-store'); next(); });

  // Only failed logins count toward the limit (10 per 10 minutes per IP).
  const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 10, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Too many failed attempts. Try again in a few minutes.' } });

  const nameOf = async (u) => (u.tenantId ? (await Tenant.findById(u.tenantId, 'name'))?.name : 'Owner');

  // ---- auth
  r.post('/auth/login', loginLimiter, h(async (req) => {
    const { email, password } = validate(req.body, { email: v.email(), password: v.str({ max: 100 }) });
    const u = await User.findOne({ email });
    const ok = await bcrypt.compare(password, u?.passwordHash ?? DUMMY_HASH);
    if (!u || !ok) throw new ApiError(401, 'Incorrect email or password.');
    const token = jwt.sign({ uid: u.id, role: u.role }, config.jwtSecret, { expiresIn: `${config.tokenTtlHours}h` });
    const user = { id: u.id, email: u.email, role: u.role, tenantId: u.tenant ? String(u.tenant) : null };
    return { token, user: { ...user, name: await nameOf(user) } };
  }));
  r.get('/auth/me', any, h(async (req) => ({ ...req.user, name: await nameOf(req.user) })));

  // ---- owner: overview
  r.get('/dashboard', owner, h(async (req) => { await syncAllRent(req.today); return dashboard(req.today); }));

  // ---- owner: rooms & beds
  r.get('/rooms', owner, h((req) => listRooms(req.today)));
  r.post('/rooms', owner, h(async (req) => ({ id: await createRoom(validate(req.body, {
    name: v.str({ max: 30 }), floor: v.optional(v.int({ min: -2, max: 100 }), 0), notes: v.optional(v.str({ max: 300 })),
    bedCount: v.int({ min: 1, max: 12 }), monthlyRent: v.int({ min: 1, max: mx }),
  })) }), 201));
  r.post('/rooms/:id/beds', owner, h(async (req) => ({ id: await addBed(idParam(req.params.id, 'Room'),
    validate(req.body, { label: v.str({ max: 10 }), monthlyRent: v.int({ min: 1, max: mx }) })) }), 201));
  r.patch('/beds/:id', owner, h((req) => updateBedRent(idParam(req.params.id, 'Bed'), validate(req.body, { monthlyRent: v.int({ min: 1, max: mx }) }).monthlyRent)));

  // ---- owner: tenants
  r.get('/tenants', owner, h((req) => listTenants(req.today)));
  r.post('/tenants', owner, h(async (req) => ({ id: await createTenant(validate(req.body, {
    name: v.str({ min: 2, max: 80 }), email: v.email(), phone: v.phone(), password: v.password(),
  })) }), 201));
  r.get('/tenants/:id', owner, h((req) => getTenantDetail(idParam(req.params.id, 'Tenant'), req.today)));

  // ---- owner: stays (check-in / check-out)
  r.post('/stays', owner, h((req) => checkIn(validate(req.body, {
    tenantId: v.id(), bedId: v.id(), checkIn: v.date(),
    monthlyRent: v.optional(v.int({ min: 1, max: mx }), undefined), deposit: v.optional(v.int({ min: 0, max: 10_000_000 }), 0),
  }), req.today), 201));
  r.post('/stays/:id/checkout', owner, h((req) => checkOut(idParam(req.params.id, 'Stay'), validate(req.body, {
    checkOut: v.date(),
    deductions: v.optional(v.array(v.object({ reason: v.str({ max: 100 }), amount: v.int({ min: 1 }) }), { max: 10 }), []),
  }), req.today)));
  r.get('/stays/:id', owner, h((req) => getStay(idParam(req.params.id, 'Stay'))));

  // ---- owner: rent & payments
  r.get('/rent', owner, h(async (req) => {
    const q = validate(req.query, { month: v.optional(v.month(), undefined), status: v.optional(v.oneOf(['Due', 'Paid', 'Overdue']), undefined) });
    await syncAllRent(req.today);
    return listRent(q, req.today);
  }));
  r.post('/rent/generate', owner, h(async (req) => { await syncAllRent(req.today); }));
  r.post('/rent/:id/payments', owner, h((req) => recordPayment({
    rentId: idParam(req.params.id, 'Rent record'),
    ...validate(req.body, {
      amount: v.int({ min: 1, max: 10_000_000 }), paidOn: v.optional(v.date(), req.today),
      method: v.optional(v.oneOf(['cash', 'upi', 'bank', 'card', 'other']), 'cash'), note: v.optional(v.str({ max: 200 })),
    }),
    userId: req.user.id,
  }, req.today), 201));

  // ---- receipts: owner, or the tenant it belongs to
  r.get('/payments/:id/receipt', any, h(async (req) => {
    const rec = await getReceipt(idParam(req.params.id, 'Payment'), req.today);
    if (req.user.role === 'tenant' && req.user.tenantId !== rec.tenantId) throw new ApiError(404, 'Payment not found');
    return rec;
  }));

  // ---- tenant self-service
  r.get('/me/rent', tenant, h(async (req) => {
    await syncAllRent(req.today);
    return { balance: await tenantBalance(req.user.tenantId, req.today), rent: await listRent({ tenantId: req.user.tenantId, withPayments: true }, req.today) };
  }));

  // ---- complaints
  r.get('/complaints', any, h((req) => {
    const q = validate(req.query, { status: v.optional(v.oneOf(STATUSES), undefined) });
    return listComplaints({ status: q.status, tenantId: req.user.role === 'tenant' ? req.user.tenantId : undefined });
  }));
  r.post('/complaints', tenant, h((req) => createComplaint(req.user.tenantId, validate(req.body, {
    category: v.oneOf(CATEGORIES), title: v.str({ min: 3, max: 100 }), description: v.str({ min: 5, max: 1000 }),
  })), 201));
  r.patch('/complaints/:id', owner, h((req) => updateComplaint(idParam(req.params.id, 'Complaint'),
    validate(req.body, { status: v.oneOf(STATUSES), ownerNote: v.optional(v.str({ max: 500 }), null) }))));

  return r;
}
