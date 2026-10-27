import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { ROOT } from './config.js';
import { buildRoutes } from './routes/index.js';
import { errorHandler } from './middleware/error.js';

export function createApp({ config }) {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', buildRoutes(config));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Production: serve the built React app and fall back to index.html for client-side routes.
  const dist = path.join(ROOT, 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
