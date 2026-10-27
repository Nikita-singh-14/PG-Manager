import { ApiError } from './errors.js';
import { isValidDate, isValidMonth } from './lib/dates.js';

class RuleError extends Error {}
const bad = (msg) => { throw new RuleError(msg); };

// Each rule takes the raw value and returns the cleaned value or throws RuleError.
export const rules = {
  str: ({ min = 1, max = 200 } = {}) => (v) => {
    if (typeof v !== 'string') bad('is required');
    const s = v.trim();
    if (s.length < min) bad(min === 1 ? 'is required' : `must be at least ${min} characters`);
    if (s.length > max) bad(`must be at most ${max} characters`);
    return s;
  },
  email: () => (v) => {
    if (typeof v !== 'string') bad('is required');
    const s = v.trim().toLowerCase();
    if (s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) bad('must be a valid email address');
    return s;
  },
  phone: () => (v) => {
    if (typeof v !== 'string') bad('is required');
    const s = v.trim();
    if (!/^\+?[0-9 -]{7,16}$/.test(s) || s.replace(/\D/g, '').length < 7) bad('must be a valid phone number');
    return s;
  },
  password: () => (v) => {
    if (typeof v !== 'string' || v.length < 8) bad('must be at least 8 characters');
    if (v.length > 100) bad('must be at most 100 characters');
    return v;
  },
  int: ({ min = 0, max = 10_000_000 } = {}) => (v) => {
    const n = typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v) : v;
    if (typeof n !== 'number' || !Number.isInteger(n)) bad('must be a whole number');
    if (n < min) bad(`must be at least ${min}`);
    if (n > max) bad(`must be at most ${max}`);
    return n;
  },
  id: () => (v) => { if (typeof v !== 'string' || !/^[a-f\d]{24}$/i.test(v)) bad('is invalid'); return v; },
  date: () => (v) => { if (!isValidDate(v)) bad('must be a valid date (YYYY-MM-DD)'); return v; },
  month: () => (v) => { if (!isValidMonth(v)) bad('must be a valid month (YYYY-MM)'); return v; },
  oneOf: (list) => (v) => { if (!list.includes(v)) bad(`must be one of: ${list.join(', ')}`); return v; },
  array: (rule, { max = 20 } = {}) => (v) => {
    if (!Array.isArray(v)) bad('must be a list');
    if (v.length > max) bad(`can have at most ${max} items`);
    return v.map((item, i) => { try { return rule(item); } catch (e) { if (e instanceof RuleError) bad(`item ${i + 1} ${e.message}`); throw e; } });
  },
  /** Make a rule optional: undefined/null/'' -> fallback. */
  optional: (rule, fallback = null) => (v) => (v === undefined || v === null || v === '' ? fallback : rule(v)),
  /** Nested object validated against a schema. */
  object: (schema) => (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) bad('is invalid');
    const { out, fields } = run(v, schema);
    const first = Object.entries(fields)[0];
    if (first) bad(`${first[0]} ${first[1]}`);
    return out;
  },
};

function run(src, schema) {
  const out = {};
  const fields = {};
  for (const [key, rule] of Object.entries(schema)) {
    try { out[key] = rule(src[key]); } catch (e) { if (e instanceof RuleError) fields[key] = e.message; else throw e; }
  }
  return { out, fields };
}

/** Validate a request body/query against a schema. Unknown keys are dropped. */
export function validate(input, schema) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const { out, fields } = run(src, schema);
  if (Object.keys(fields).length) {
    const msgs = Object.entries(fields).map(([k, m]) => `${k} ${m}`);
    throw new ApiError(400, `Invalid input: ${msgs.join('; ')}`, fields);
  }
  return out;
}

export function idParam(v, what = 'Item') {
  if (typeof v !== 'string' || !/^[a-f\d]{24}$/i.test(v)) throw new ApiError(404, `${what} not found`);
  return v;
}
