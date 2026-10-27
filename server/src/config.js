import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const env = process.env;
export const config = {
  port: Number(env.PORT) || 5000,
  mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pg_manager',
  jwtSecret: env.JWT_SECRET || 'dev-only-insecure-secret',
  tokenTtlHours: Number(env.TOKEN_TTL_HOURS) || 12,
  clientOrigin: env.CLIENT_ORIGIN || 'http://localhost:5173',
  rentDueDay: Math.min(28, Math.max(1, Number(env.RENT_DUE_DAY) || 5)),
  timezone: env.APP_TIMEZONE || 'Asia/Kolkata',
  nodeEnv: env.NODE_ENV || 'development',
};

if (config.nodeEnv === 'production' && config.jwtSecret === 'dev-only-insecure-secret') {
  throw new Error('JWT_SECRET must be set in production');
}
