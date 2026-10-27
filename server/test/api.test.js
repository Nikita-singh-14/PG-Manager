import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { connectTestDb, closeTestDb, freshDb, seedBasic, startServer } from './helpers.js';
import { todayIn } from '../src/lib/dates.js';
import { config } from '../src/config.js';

const today = () => todayIn(config.timezone);
before(connectTestDb);
after(closeTestDb);
beforeEach(freshDb);

test('API: validation errors are 400 with per-field messages; auth is enforced', async () => {
  const { tenants } = await seedBasic();
  const srv = await startServer();
  try {
    assert.equal((await srv.call('GET', '/tenants')).status, 401);
    assert.equal((await srv.call('POST', '/auth/login', { email: 'owner@t.test', password: 'wrong' })).status, 401);
    const owner = await srv.login('owner@t.test', 'Owner@123');
    const bad = await srv.call('POST', '/tenants', { name: 'A', email: 'nope', phone: 'abc', password: '123' }, owner);
    assert.equal(bad.status, 400);
    assert.deepEqual(Object.keys(bad.body.fields).sort(), ['email', 'name', 'password', 'phone']);
    const badStay = await srv.call('POST', '/stays', { tenantId: tenants[0], bedId: 'not-an-id', checkIn: '2026-02-30' }, owner);
    assert.equal(badStay.status, 400);
    assert.ok(badStay.body.fields.checkIn && badStay.body.fields.bedId);
    assert.equal((await srv.call('POST', '/tenants', { name: 'Dup', email: 't1@t.test', phone: '9876543210', password: 'Password1' }, owner)).status, 409);
    assert.equal((await srv.call('GET', '/tenants/zzz', null, owner)).status, 404);
  } finally { srv.close(); }
});

test("API: tenants only see their own rent, can't use owner routes or other tenants' receipts", async () => {
  const { beds, tenants } = await seedBasic();
  const srv = await startServer();
  try {
    const owner = await srv.login('owner@t.test', 'Owner@123');
    for (let i = 0; i < 2; i++) assert.equal((await srv.call('POST', '/stays', { tenantId: tenants[i], bedId: beds[i], checkIn: today() }, owner)).status, 201);
    const t1 = await srv.login('t1@t.test', 'Tenant@123');
    const t2 = await srv.login('t2@t.test', 'Tenant@123');
    const mine = await srv.call('GET', '/me/rent', null, t1);
    assert.equal(mine.status, 200);
    assert.ok(mine.body.rent.every((r) => r.tenantId === tenants[0]));
    assert.equal((await srv.call('GET', '/tenants', null, t1)).status, 403);
    assert.equal((await srv.call('GET', '/dashboard', null, t1)).status, 403);
    const pay = await srv.call('POST', `/rent/${mine.body.rent[0].id}/payments`, { amount: 500 }, owner);
    assert.equal(pay.status, 201);
    const rc = `/payments/${pay.body.paymentId}/receipt`;
    assert.equal((await srv.call('GET', rc, null, t1)).status, 200);
    assert.equal((await srv.call('GET', rc, null, t2)).status, 404);
  } finally { srv.close(); }
});

test('API: complaints - tenant raises, sees only own; owner updates status', async () => {
  await seedBasic();
  const srv = await startServer();
  try {
    const owner = await srv.login('owner@t.test', 'Owner@123');
    const t1 = await srv.login('t1@t.test', 'Tenant@123');
    const t2 = await srv.login('t2@t.test', 'Tenant@123');
    assert.equal((await srv.call('POST', '/complaints', { category: 'plumbing', title: 'x', description: 'y' }, t1)).status, 400);
    const c = await srv.call('POST', '/complaints', { category: 'plumbing', title: 'Leaking tap', description: 'Bathroom tap drips all night' }, t1);
    assert.equal(c.status, 201);
    assert.equal(c.body.status, 'open');
    assert.equal((await srv.call('PATCH', `/complaints/${c.body.id}`, { status: 'resolved' }, t1)).status, 403);
    const upd = await srv.call('PATCH', `/complaints/${c.body.id}`, { status: 'in_progress', ownerNote: 'Plumber coming Friday' }, owner);
    assert.deepEqual([upd.body.status, upd.body.ownerNote], ['in_progress', 'Plumber coming Friday']);
    assert.equal((await srv.call('PATCH', `/complaints/${c.body.id}`, { status: 'done' }, owner)).status, 400);
    assert.equal((await srv.call('GET', '/complaints', null, t2)).body.length, 0);
    assert.equal((await srv.call('GET', '/complaints', null, owner)).body.length, 1);
  } finally { srv.close(); }
});

test('API: dashboard reports occupancy, collected rent and overdue tenants', async () => {
  const { beds, tenants } = await seedBasic();
  const srv = await startServer();
  try {
    const owner = await srv.login('owner@t.test', 'Owner@123');
    const d = new Date(Date.now() - 70 * 86400000).toISOString().slice(0, 10); // ~70 days ago, never paid -> overdue
    await srv.call('POST', '/stays', { tenantId: tenants[0], bedId: beds[0], checkIn: d }, owner);
    await srv.call('POST', '/stays', { tenantId: tenants[1], bedId: beds[1], checkIn: today() }, owner);
    const dash = (await srv.call('GET', '/dashboard', null, owner)).body;
    assert.deepEqual([dash.occupancy.occupied, dash.occupancy.total], [2, 2]);
    assert.equal(dash.overdueTenants.length, 1);
    assert.equal(dash.overdueTenants[0].tenantId, tenants[0]);
    assert.equal(dash.rent.collectedThisMonth, 0);
  } finally { srv.close(); }
});
