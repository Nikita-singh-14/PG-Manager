import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidDate, isValidMonth, addMonths, monthsBetween, daysInMonth, diffDays, addDays } from '../src/lib/dates.js';
import { validate, rules as v, idParam } from '../src/validate.js';

test('dates: real calendar validation and month arithmetic', () => {
  assert.ok(isValidDate('2028-02-29')); assert.ok(!isValidDate('2026-02-29')); assert.ok(!isValidDate('2026-13-01')); assert.ok(!isValidDate('2026-4-1'));
  assert.ok(isValidMonth('2026-12')); assert.ok(!isValidMonth('2026-13'));
  assert.equal(addMonths('2026-11', 3), '2027-02'); assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.deepEqual(monthsBetween('2026-11', '2027-01'), ['2026-11', '2026-12', '2027-01']);
  assert.deepEqual(monthsBetween('2026-05', '2026-04'), []);
  assert.equal(daysInMonth('2028-02'), 29); assert.equal(diffDays('2026-03-31', '2026-04-01'), 1); assert.equal(addDays('2026-02-28', 1), '2026-03-01');
});

test('validate: collects every field error, trims, coerces numeric strings, drops unknown keys', () => {
  const schema = { name: v.str({ min: 2 }), email: v.email(), amount: v.int({ min: 1 }), when: v.date(), id: v.id(), note: v.optional(v.str()) };
  assert.throws(() => validate({ name: 'A', email: 'x', amount: 0, when: '2026-02-30', id: 'abc' }, schema),
    (e) => e.status === 400 && Object.keys(e.fields).sort().join() === 'amount,email,id,name,when');
  const ok = validate({ name: '  Asha ', email: ' ASHA@Example.com ', amount: '250', when: '2026-04-01', id: '65f0000000000000000000aa', hack: 1 }, schema);
  assert.deepEqual(ok, { name: 'Asha', email: 'asha@example.com', amount: 250, when: '2026-04-01', id: '65f0000000000000000000aa', note: null });
  assert.throws(() => validate({ amount: 1.5 }, { amount: v.int() }), (e) => Boolean(e.fields.amount));
});

test('validate: nested arrays and ids from URLs', () => {
  const rule = v.array(v.object({ reason: v.str(), amount: v.int({ min: 1 }) }), { max: 2 });
  assert.deepEqual(rule([{ reason: 'Paint', amount: 100 }]), [{ reason: 'Paint', amount: 100 }]);
  assert.throws(() => rule([{ reason: '', amount: 5 }]));
  assert.throws(() => rule([1, 2, 3]));
  assert.throws(() => idParam('not-an-id', 'Tenant'), (e) => e.status === 404);
  assert.equal(idParam('65f0000000000000000000aa'), '65f0000000000000000000aa');
});
