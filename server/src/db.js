import mongoose from 'mongoose';
import './models.js';

export async function connectDb(uri) {
  await mongoose.connect(uri);
  // Build indexes (unique / partial) and wait until they exist before serving traffic.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}
