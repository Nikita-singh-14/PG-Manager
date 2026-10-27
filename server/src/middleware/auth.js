import jwt from 'jsonwebtoken';
import { User } from '../models.js';
import { ApiError } from '../errors.js';

/** auth('owner' | 'tenant' | 'any'): verifies the Bearer token, loads the user, checks the role. */
export const auth = (config, role = 'any') => async (req, _res, next) => {
  try {
    const header = req.headers.authorization || '';
    let payload;
    try { payload = jwt.verify(header.startsWith('Bearer ') ? header.slice(7) : '', config.jwtSecret); }
    catch { throw new ApiError(401, 'Please log in again.'); }
    const user = await User.findById(payload.uid);
    if (!user) throw new ApiError(401, 'Please log in again.');
    if (role !== 'any' && user.role !== role) throw new ApiError(403, 'You are not allowed to do this.');
    req.user = { id: user.id, email: user.email, role: user.role, tenantId: user.tenant ? String(user.tenant) : null };
    next();
  } catch (e) { next(e); }
};
