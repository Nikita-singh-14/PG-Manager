// Wipes the database and fills it with demo data. Dates are relative to today so the demo always
// shows a mix of Paid / Due / Overdue and a pro-rated month.
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { connectDb } from '../src/db.js';
import { Bed, User } from '../src/models.js';
import { todayIn, addDays, addMonths, monthOf } from '../src/lib/dates.js';
import { createRoom } from '../src/services/rooms.js';
import { createTenant } from '../src/services/tenants.js';
import { checkIn, checkOut } from '../src/services/stays.js';
import { listRent, syncAllRent } from '../src/services/rent.js';
import { recordPayment } from '../src/services/payments.js';
import { createComplaint, updateComplaint } from '../src/services/complaints.js';

if (config.nodeEnv === 'production' && !process.argv.includes('--force')) {
  console.error('Refusing to wipe a production database. Re-run with --force if you really mean it.');
  process.exit(1);
}
await connectDb(config.mongoUri);
await mongoose.connection.dropDatabase();
await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes())); // recreate unique/partial indexes after the drop

const today = todayIn(config.timezone);
const thisMonth = monthOf(today);
const monthsAgo = (n, day = 1) => `${addMonths(thisMonth, -n)}-${String(day).padStart(2, '0')}`;

await User.create({ email: 'owner@pg.test', passwordHash: await bcrypt.hash('Owner@123', 10), role: 'owner' });

for (const [name, floor, bedCount, monthlyRent] of [['101', 1, 3, 6000], ['102', 1, 2, 8000], ['201', 2, 4, 5000], ['202', 2, 2, 7000]]) {
  await createRoom({ name, floor, notes: name === '102' ? 'AC room' : null, bedCount, monthlyRent });
}
const bed = async (room, label) => (await Bed.find({ label }).populate('room')).find((b) => b.room.name === room).id;

const people = [['Aarav Sharma', 1], ['Priya Verma', 2], ['Rohan Das', 3], ['Sneha Patel', 4], ['Karan Mehta', 5], ['Meera Iyer', 6], ['Vikram Singh', 7]];
const T = [];
for (const [name, n] of people) T.push(await createTenant({ name, email: `tenant${n}@pg.test`, phone: `98765000${String(n).padStart(2, '0')}`, password: 'Tenant@123' }));

const stay = async (i, room, label, date, deposit) => checkIn({ tenantId: T[i], bedId: await bed(room, label), checkIn: date, deposit }, today);
await stay(0, '101', 'A', monthsAgo(3), 12000);         // long-term, part payment this month
await stay(1, '102', 'A', monthsAgo(2, 12), 16000);     // moved in mid-month -> pro-rated first month
await stay(2, '201', 'A', addDays(today, -9), 10000);   // moved in recently
await stay(3, '201', 'B', monthsAgo(4), 10000);         // always pays on time
const s4 = await stay(4, '101', 'B', monthsAgo(3), 12000); // leaves last month
await stay(5, '202', 'A', monthsAgo(1), 14000);         // never paid -> overdue
// Vikram (T[6]) has no bed yet: ready for a live check-in demo.

await checkOut(s4.id, { checkOut: monthsAgo(1, 18), deductions: [{ reason: 'Broken cupboard door', amount: 1500 }, { reason: 'Room painting', amount: 1000 }] }, today);
await syncAllRent(today);

const rentOf = async (tid) => (await listRent({ tenantId: tid }, today)).sort((a, b) => a.month.localeCompare(b.month));
const payFull = async (tid, skipMonth) => {
  for (const r of await rentOf(tid)) {
    if (r.month === skipMonth || r.outstanding === 0) continue;
    await recordPayment({ rentId: r.id, amount: r.outstanding, paidOn: r.dueDate > today ? today : r.dueDate, method: 'upi' }, today);
  }
};
await payFull(T[0], thisMonth);
const cur = (await rentOf(T[0])).find((r) => r.month === thisMonth);
await recordPayment({ rentId: cur.id, amount: 2500, paidOn: today, method: 'cash', note: 'Part payment, rest next week' }, today);
await payFull(T[1], thisMonth);
await payFull(T[3]);
await payFull(T[4]);

const c1 = await createComplaint(T[0], { category: 'plumbing', title: 'Bathroom tap leaking', description: 'The tap in the common bathroom on floor 1 keeps dripping all night.' });
await updateComplaint(c1.id, { status: 'in_progress', ownerNote: 'Plumber booked for Saturday.' });
await createComplaint(T[1], { category: 'internet', title: 'Wi-Fi very slow in evenings', description: 'Speed drops below 1 Mbps after 8 pm, hard to attend online classes.' });
const c3 = await createComplaint(T[3], { category: 'electrical', title: 'Fan regulator broken', description: 'Ceiling fan in room 201 is stuck on the highest speed.' });
await updateComplaint(c3.id, { status: 'resolved', ownerNote: 'Regulator replaced.' });

console.log('Seeded. Demo logins:\n  owner   owner@pg.test   / Owner@123\n  tenant  tenant1@pg.test ... tenant7@pg.test / Tenant@123');
await mongoose.disconnect();
