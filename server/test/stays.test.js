import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { connectTestDb, closeTestDb, freshDb, seedBasic, startServer } from './helpers.js';
import { checkIn, checkOut, releaseOrphanBookings } from '../src/services/stays.js';
import { Bed, Stay } from '../src/models.js';
import { todayIn } from '../src/lib/dates.js';
import { config } from '../src/config.js';

const TODAY = '2026-04-20';
before(connectTestDb);
after(closeTestDb);
beforeEach(freshDb);
const is409 = (re) => (e) => e.status === 409 && (!re || re.test(e.message));

test('a bed cannot be given to two tenants at once (open-ended stays)', async () => {
  const { beds, tenants } = await seedBasic();
  await checkIn({ tenantId: tenants[0], bedId: beds[0], checkIn: '2026-04-01' }, TODAY);
  await assert.rejects(() => checkIn({ tenantId: tenants[1], bedId: beds[0], checkIn: '2026-04-10' }, TODAY), is409(/already occupied by Tenant 1/));
});

test('overlapping date ranges are rejected, back-to-back stays are allowed', async () => {
  const { beds, tenants } = await seedBasic();
  const s = await checkIn({ tenantId: tenants[0], bedId: beds[0], checkIn: '2026-04-01' }, TODAY);
  await checkOut(s.id, { checkOut: '2026-04-15' }, TODAY);
  await assert.rejects(() => checkIn({ tenantId: tenants[1], bedId: beds[0], checkIn: '2026-04-15' }, TODAY), is409()); // last occupied day
  await assert.rejects(() => checkIn({ tenantId: tenants[1], bedId: beds[0], checkIn: '2026-04-05' }, TODAY), is409()); // inside old stay
  const next = await checkIn({ tenantId: tenants[1], bedId: beds[0], checkIn: '2026-04-16' }, TODAY); // day after
  assert.equal(next.bedId, beds[0]);
});

test('a tenant cannot occupy two beds at the same time, and the failed attempt leaves the bed free', async () => {
  const { beds, tenants } = await seedBasic();
  await checkIn({ tenantId: tenants[0], bedId: beds[0], checkIn: '2026-04-01' }, TODAY);
  await assert.rejects(() => checkIn({ tenantId: tenants[0], bedId: beds[1], checkIn: '2026-04-05' }, TODAY), is409(/already has a bed/));
  assert.equal((await Bed.findById(beds[1])).bookings.length, 0); // compensation released the claimed bed
  await checkIn({ tenantId: tenants[1], bedId: beds[1], checkIn: '2026-04-05' }, TODAY); // still bookable
});

test('MongoDB itself rejects a second open stay for the same bed (unique partial index backstop)', async () => {
  const { beds, tenants } = await seedBasic();
  await checkIn({ tenantId: tenants[0], bedId: beds[0], checkIn: '2026-04-01' }, TODAY);
  await assert.rejects(() => Stay.create({ tenant: tenants[1], bed: beds[0], checkIn: '2026-04-02', monthlyRent: 6000 }), (e) => e.code === 11000);
});

test('three simultaneous HTTP check-ins for the same bed: exactly one wins', async () => {
  const { beds, tenants } = await seedBasic();
  const srv = await startServer();
  try {
    const token = await srv.login('owner@t.test', 'Owner@123');
    const date = todayIn(config.timezone);
    const results = await Promise.all(tenants.map((t) => srv.call('POST', '/stays', { tenantId: t, bedId: beds[0], checkIn: date }, token)));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409]);
    assert.equal(await Stay.countDocuments({ bed: beds[0] }), 1);
    assert.equal((await Bed.findById(beds[0])).bookings.length, 1);
  } finally { srv.close(); }
});

test('the same tenant checked into two different beds at once: exactly one wins', async () => {
  const { beds, tenants } = await seedBasic();
  const srv = await startServer();
  try {
    const token = await srv.login('owner@t.test', 'Owner@123');
    const date = todayIn(config.timezone);
    const results = await Promise.all(beds.map((b) => srv.call('POST', '/stays', { tenantId: tenants[0], bedId: b, checkIn: date }, token)));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    const free = (await Bed.find()).filter((b) => b.bookings.length === 0);
    assert.equal(free.length, 1); // the losing bed was released
  } finally { srv.close(); }
});

test('check-out validation: before check-in, twice, deductions above deposit; refund = deposit - deductions', async () => {
  const { beds, tenants } = await seedBasic();
  const s = await checkIn({ tenantId: tenants[0], bedId: beds[0], checkIn: '2026-04-10', deposit: 5000 }, TODAY);
  await assert.rejects(() => checkOut(s.id, { checkOut: '2026-04-09' }, TODAY), (e) => e.status === 400);
  await assert.rejects(() => checkOut(s.id, { checkOut: '2026-04-18', deductions: [{ reason: 'Damage', amount: 5001 }] }, TODAY), (e) => e.status === 400);
  const out = await checkOut(s.id, { checkOut: '2026-04-18', deductions: [{ reason: 'Damaged mattress', amount: 1500 }] }, TODAY);
  assert.equal(out.depositRefund, 3500);
  await assert.rejects(() => checkOut(s.id, { checkOut: '2026-04-19' }, TODAY), is409());
});

test('orphaned bookings (crash between claim and stay creation) are cleaned up at startup', async () => {
  const { beds } = await seedBasic();
  await Bed.updateOne({ _id: beds[0] }, { $push: { bookings: { stay: '65f000000000000000000001', from: '2026-04-01', to: '9999-12-31' } } });
  assert.equal(await releaseOrphanBookings(), 1);
  assert.equal((await Bed.findById(beds[0])).bookings.length, 0);
});
