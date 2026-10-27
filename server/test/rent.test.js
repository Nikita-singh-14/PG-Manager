import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { connectTestDb, closeTestDb, freshDb, seedBasic } from './helpers.js';
import { checkIn, checkOut } from '../src/services/stays.js';
import { listRent, syncAllRent, tenantBalance } from '../src/services/rent.js';
import { recordPayment } from '../src/services/payments.js';
import { RentRecord } from '../src/models.js';

before(connectTestDb);
after(closeTestDb);
beforeEach(freshDb);

test('mid-month move-in creates a pro-rated first month and full later months', async () => {
  const { beds, tenants } = await seedBasic();
  // 11 Mar..31 Mar = 21 days of 31 -> 6000*21/31 = 4064.5 -> 4065 ; April full
  await checkIn({ tenantId: tenants[0], bedId: beds[0], checkIn: '2026-03-11' }, '2026-04-20');
  const rows = (await listRent({ tenantId: tenants[0] }, '2026-04-20')).reverse();
  assert.deepEqual(rows.map((r) => [r.month, r.daysOccupied, r.amountDue]), [['2026-03', 21, 4065], ['2026-04', 30, 6000]]);
});

test('mid-month move-out re-prorates the final month and removes later months', async () => {
  const { beds, tenants } = await seedBasic();
  const s = await checkIn({ tenantId: tenants[0], bedId: beds[0], checkIn: '2026-03-01' }, '2026-04-20');
  assert.equal((await listRent({}, '2026-04-20')).length, 2);
  await checkOut(s.id, { checkOut: '2026-04-10' }, '2026-04-20');
  const [april] = await listRent({ month: '2026-04' }, '2026-04-20');
  assert.equal(april.daysOccupied, 10);
  assert.equal(april.amountDue, 2000);
  await syncAllRent('2026-06-15'); // later "today" must not create May/June for a tenant who left in April
  assert.deepEqual((await listRent({}, '2026-06-15')).map((r) => r.month).sort(), ['2026-03', '2026-04']);
});

test('check-out after rent was already paid leaves a credit, never a negative balance', async () => {
  const { beds, tenants } = await seedBasic();
  const s = await checkIn({ tenantId: tenants[0], bedId: beds[0], checkIn: '2026-04-01' }, '2026-04-02');
  const [apr] = await listRent({}, '2026-04-02');
  await recordPayment({ rentId: apr.id, amount: 6000, paidOn: '2026-04-02' }, '2026-04-02');
  await checkOut(s.id, { checkOut: '2026-04-15' }, '2026-04-20');
  const [after] = await listRent({}, '2026-04-20');
  assert.deepEqual([after.amountDue, after.outstanding, after.status], [3000, 0, 'Paid']);
  assert.equal((await tenantBalance(tenants[0], '2026-04-20')).credit, 3000);
});

test('part payments reduce the balance; status goes Due -> Overdue -> Paid', async () => {
  const { beds, tenants } = await seedBasic();
  await checkIn({ tenantId: tenants[0], bedId: beds[0], checkIn: '2026-04-01' }, '2026-04-02');
  const rent = async (today) => (await listRent({ withPayments: true }, today))[0];
  assert.equal((await rent('2026-04-03')).status, 'Due'); // due on the 5th
  const today = '2026-04-06';
  assert.equal((await rent(today)).status, 'Overdue');
  const { id } = await rent(today);
  await recordPayment({ rentId: id, amount: 2500, paidOn: today, method: 'upi' }, today);
  let r = await rent(today);
  assert.deepEqual([r.balance, r.status], [3500, 'Overdue']); // part payment doesn't clear it
  await recordPayment({ rentId: id, amount: 3500, paidOn: today }, today);
  r = await rent(today);
  assert.equal(r.status, 'Paid');
  assert.equal(r.payments.length, 2);
});

test('over-payment, future-dated and duplicate payments are rejected', async () => {
  const { beds, tenants } = await seedBasic();
  await checkIn({ tenantId: tenants[0], bedId: beds[0], checkIn: '2026-04-01' }, '2026-04-06');
  const [{ id }] = await listRent({}, '2026-04-06');
  await assert.rejects(() => recordPayment({ rentId: id, amount: 6001, paidOn: '2026-04-06' }, '2026-04-06'), (e) => e.status === 422);
  await assert.rejects(() => recordPayment({ rentId: id, amount: 100, paidOn: '2026-04-07' }, '2026-04-06'), (e) => e.status === 400);
  await recordPayment({ rentId: id, amount: 6000, paidOn: '2026-04-06' }, '2026-04-06');
  await assert.rejects(() => recordPayment({ rentId: id, amount: 1, paidOn: '2026-04-06' }, '2026-04-06'), (e) => e.status === 409);
});

test('two simultaneous payments cannot together exceed the rent due', async () => {
  const { beds, tenants } = await seedBasic();
  await checkIn({ tenantId: tenants[0], bedId: beds[0], checkIn: '2026-04-01' }, '2026-04-06');
  const [{ id }] = await listRent({}, '2026-04-06');
  const results = await Promise.allSettled([1, 2, 3].map(() => recordPayment({ rentId: id, amount: 4000, paidOn: '2026-04-06' }, '2026-04-06')));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1); // 4000 fits once; a second 4000 would exceed 6000
  assert.equal((await RentRecord.findById(id)).paid, 4000);
});

test('rent generation is idempotent and a mid-month move-in is not overdue on day one', async () => {
  const { beds, tenants } = await seedBasic();
  await checkIn({ tenantId: tenants[0], bedId: beds[0], checkIn: '2026-04-20' }, '2026-04-20');
  await Promise.all([1, 2, 3].map(() => syncAllRent('2026-04-20'))); // even concurrently
  const rows = await listRent({}, '2026-04-20');
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].status, rows[0].amountDue], ['Due', 2200]); // 11 days of 30; due date = check-in day
});
