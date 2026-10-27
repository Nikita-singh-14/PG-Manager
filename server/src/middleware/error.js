import { ApiError } from '../errors.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) return res.status(err.status).json({ error: err.message, fields: err.fields });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must be valid JSON' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
  if (err?.name === 'CastError' || err?.name === 'ValidationError') return res.status(400).json({ error: 'Invalid input' });
  if (err?.code === 11000) return res.status(409).json({ error: 'That record already exists.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
}
