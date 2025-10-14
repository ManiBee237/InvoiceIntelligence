import jwt from 'jsonwebtoken';

export default function authRequired(req, res, next) {
  try {
    const ah = req.headers.authorization || '';
    const [, token] = ah.split(' ');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
    const payload = jwt.verify(token, secret);

    req.auth = { userId: payload.sub, tenantId: payload.tenantId, role: payload.role };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
