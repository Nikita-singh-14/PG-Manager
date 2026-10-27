import { Room, Bed, Stay } from '../models.js';
import { ApiError } from '../errors.js';

export async function listRooms(today) {
  const [rooms, beds, stays] = await Promise.all([
    Room.find().sort({ floor: 1, name: 1 }),
    Bed.find().sort({ label: 1 }),
    Stay.find({ $or: [{ checkOut: null }, { checkOut: { $gte: today } }] }).populate('tenant', 'name').sort({ checkIn: 1 }),
  ]);
  const fmt = (s) => s && { stayId: s.id, tenantId: s.tenant.id, name: s.tenant.name, since: s.checkIn, until: s.checkOut };
  return rooms.map((r) => ({
    id: r.id, name: r.name, floor: r.floor, notes: r.notes,
    beds: beds.filter((b) => String(b.room) === r.id).map((b) => {
      const mine = stays.filter((s) => String(s.bed) === b.id);
      return {
        id: b.id, label: b.label, monthlyRent: b.monthlyRent,
        occupant: fmt(mine.find((s) => s.checkIn <= today)) || null,
        upcoming: mine.filter((s) => s.checkIn > today).map(fmt),
      };
    }),
  }));
}

export async function createRoom({ name, floor, notes, bedCount, monthlyRent }) {
  let room;
  try { room = await Room.create({ name, floor, notes }); }
  catch (e) { if (e.code === 11000) throw new ApiError(409, `Room "${name}" already exists.`, { name: 'Already exists' }); throw e; }
  try {
    await Bed.insertMany(Array.from({ length: bedCount }, (_, i) => ({ room: room._id, label: String.fromCharCode(65 + i), monthlyRent })));
  } catch (e) { await Bed.deleteMany({ room: room._id }); await room.deleteOne(); throw e; }
  return room.id;
}

export async function addBed(roomId, { label, monthlyRent }) {
  if (!(await Room.exists({ _id: roomId }))) throw new ApiError(404, 'Room not found');
  try { return (await Bed.create({ room: roomId, label, monthlyRent })).id; }
  catch (e) { if (e.code === 11000) throw new ApiError(409, `Bed "${label}" already exists in this room.`, { label: 'Already exists' }); throw e; }
}

export async function updateBedRent(bedId, monthlyRent) {
  const r = await Bed.updateOne({ _id: bedId }, { $set: { monthlyRent } });
  if (!r.matchedCount) throw new ApiError(404, 'Bed not found');
}
