import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models.js';
import { createRoom } from '../src/services/rooms.js';
import { createTenant } from '../src/services/tenants.js';
import { Bed } from '../src/models.js';

let memory;
/** Connect once per test file. Uses MONGODB_URI_TEST if set, otherwise an in-memory MongoDB (downloaded on first run). */
export async function connectTestDb() {
  let uri = process.env.MONGODB_URI_TEST;
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memory = await MongoMemoryServer.create();
    uri = memory.getUri();
  }
  await mongoose.connect(uri);
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
}
export async function closeTestDb() {
  await mongoose.disconnect();
  if (memory) await memory.stop();
}
/** Empty every collection (indexes stay) and create the owner. */
export async function freshDb() {
  for (const m of Object.values(mongoose.models)) await m.deleteMany({});
  await User.create({ email: 'owner@t.test', passwordHash: await bcrypt.hash('Owner@123', 4), role: 'owner' });
}
/** Room "R1" with 2 beds at ₹6000, plus tenants. Returns ids (strings). */
export async function seedBasic(tenantCount = 3) {
  await createRoom({ name: 'R1', floor: 1, notes: null, bedCount: 2, monthlyRent: 6000 });
  const beds = (await Bed.find().sort({ label: 1 })).map((b) => b.id);
  const tenants = [];
  for (let i = 1; i <= tenantCount; i++) tenants.push(await createTenant({ name: `Tenant ${i}`, email: `t${i}@t.test`, phone: '9876543210', password: 'Tenant@123' }));
  return { beds, tenants };
}
export async function startServer() {
  const server = createApp({ config }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://localhost:${server.address().port}/api`;
  const call = async (method, path, body, token) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  const login = async (email, password) => (await call('POST', '/auth/login', { email, password })).body.token;
  return { call, login, close: () => server.close() };
}
