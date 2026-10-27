import bcrypt from 'bcryptjs';
import { Tenant, User, Stay } from '../models.js';
import { ApiError } from '../errors.js';
import { listRent, balanceOf } from './rent.js';

export async function createTenant({ name, email, phone, password }) {
  if ((await User.exists({ email })) || (await Tenant.exists({ email }))) throw new ApiError(409, 'A user with this email already exists.', { email: 'Already in use' });
  let tenant;
  try { tenant = await Tenant.create({ name, email, phone }); }
  catch (e) { if (e.code === 11000) throw new ApiError(409, 'A user with this email already exists.', { email: 'Already in use' }); throw e; }
  try { await User.create({ email, passwordHash: await bcrypt.hash(password, 10), role: 'tenant', tenant: tenant._id }); }
  catch (e) { await tenant.deleteOne(); throw e; }
  return tenant.id;
}

const stayShape = (s) => s && { id: s.id, checkIn: s.checkIn, checkOut: s.checkOut, monthlyRent: s.monthlyRent, deposit: s.deposit, bed: s.bed.label, room: s.bed.room.name };
const currentStays = (today, tenantId) => Stay.find({ ...(tenantId ? { tenant: tenantId } : {}), checkIn: { $lte: today }, $or: [{ checkOut: null }, { checkOut: { $gte: today } }] })
  .populate({ path: 'bed', populate: 'room' });

export async function listTenants(today) {
  const [tenants, stays, rent] = await Promise.all([Tenant.find().sort({ name: 1 }), currentStays(today), listRent({}, today)]);
  return tenants.map((t) => ({
    id: t.id, name: t.name, email: t.email, phone: t.phone,
    stay: stayShape(stays.find((s) => String(s.tenant) === t.id)) || null,
    ...balanceOf(rent.filter((r) => r.tenantId === t.id)),
  }));
}

export async function getTenantDetail(id, today) {
  const t = await Tenant.findById(id);
  if (!t) throw new ApiError(404, 'Tenant not found');
  const [current, all, rent] = await Promise.all([
    currentStays(today, id),
    Stay.find({ tenant: id }).populate({ path: 'bed', populate: 'room' }).sort({ checkIn: -1 }),
    listRent({ tenantId: id, withPayments: true }, today),
  ]);
  return {
    id: t.id, name: t.name, email: t.email, phone: t.phone, stay: stayShape(current[0]) || null,
    stays: all.map((s) => ({ ...stayShape(s), depositRefund: s.depositRefund, deductions: s.deductions.map((d) => ({ reason: d.reason, amount: d.amount })) })),
    balance: balanceOf(rent), rent,
  };
}
