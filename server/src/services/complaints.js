import { Complaint, Stay } from '../models.js';
import { ApiError } from '../errors.js';

async function shape(docs) {
  const stays = await Stay.find({ tenant: { $in: docs.map((c) => c.tenant._id) } }).sort({ checkIn: -1 }).populate({ path: 'bed', populate: 'room' });
  return docs.map((c) => {
    const s = stays.find((x) => String(x.tenant) === c.tenant.id);
    return {
      id: c.id, tenantId: c.tenant.id, tenantName: c.tenant.name, bed: s ? `${s.bed.room.name}-${s.bed.label}` : null,
      category: c.category, title: c.title, description: c.description, status: c.status, ownerNote: c.ownerNote, createdAt: c.createdAt,
    };
  });
}

export async function listComplaints({ tenantId, status } = {}) {
  const docs = await Complaint.find({ ...(tenantId ? { tenant: tenantId } : {}), ...(status ? { status } : {}) }).populate('tenant', 'name').sort({ createdAt: -1 });
  const out = await shape(docs);
  return [...out.filter((c) => c.status !== 'resolved'), ...out.filter((c) => c.status === 'resolved')];
}

export async function createComplaint(tenantId, { category, title, description }) {
  const c = await Complaint.create({ tenant: tenantId, category, title, description });
  return (await shape([await c.populate('tenant', 'name')]))[0];
}

export async function updateComplaint(id, { status, ownerNote }) {
  const c = await Complaint.findByIdAndUpdate(id, { status, ...(ownerNote != null ? { ownerNote } : {}) }, { new: true }).populate('tenant', 'name');
  if (!c) throw new ApiError(404, 'Complaint not found');
  return (await shape([c]))[0];
}
