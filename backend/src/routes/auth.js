// src/routes/auth.js
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Tenant from '../models/Tenant.js';
import User from '../models/User.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';
const TOKEN_TTL = process.env.JWT_TTL || '7d';

// Resolve a tenant by id/slug/name (slug preferred)
async function resolveTenant(key) {
  if (!key) return null;
  // ObjectId?
  if (/^[a-f0-9]{24}$/i.test(key)) {
    const t = await Tenant.findById(key);
    return t || null;
  }
  // slug / name
  return await Tenant.findOne({ $or: [{ slug: key }, { name: key }] });
}

function signToken(userDoc, tenantDoc) {
  return jwt.sign(
    { userId: String(userDoc._id), role: userDoc.role, tenantId: String(tenantDoc._id) },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

/**
 * POST /api/auth/register
 * body: { tenant, tenantName, email, password, name }
 * - creates tenant (if not exists) and an admin user
 */
router.post('/register', async (req, res) => {
  try {
    const { tenant, tenantName, email, password, name } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email & password required' });

    // tenant: slug or id or plain string
    let tenantDoc = await resolveTenant(tenant);
    if (!tenantDoc) {
      if (!tenantName && !tenant) return res.status(400).json({ error: 'Tenant missing' });
      const slug = (tenant || tenantName || email.split('@')[1] || 'demo')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      tenantDoc = await Tenant.create({
        name: tenantName || slug,
        slug
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase(), tenantId: tenantDoc._id });
    if (existing) return res.status(409).json({ error: 'User already exists for this tenant' });

    const hash = await bcrypt.hash(password, 10);
    const userDoc = await User.create({
      email: email.toLowerCase(),
      name: name || email.split('@')[0],
      role: 'admin',
      passwordHash: hash,
      tenantId: tenantDoc._id
    });

    const token = signToken(userDoc, tenantDoc);

    res.json({
      token,
      user: { _id: userDoc._id, name: userDoc.name, email: userDoc.email, role: userDoc.role },
      tenant: { _id: tenantDoc._id, name: tenantDoc.name, slug: tenantDoc.slug }
    });
  } catch (e) {
    console.error('[auth/register]', e);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 * body: { tenant, email, password }
 */
router.post('/login', async (req, res) => {
  try {
    const { tenant, email, password } = req.body || {};
    if (!tenant || !email || !password) return res.status(400).json({ error: 'tenant, email, password required' });

    const tenantDoc = await resolveTenant(tenant);
    if (!tenantDoc) return res.status(400).json({ error: 'Unknown tenant' });

    const userDoc = await User.findOne({ email: email.toLowerCase(), tenantId: tenantDoc._id });
    if (!userDoc) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, userDoc.passwordHash || '');
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(userDoc, tenantDoc);

    res.json({
      token,
      user: { _id: userDoc._id, name: userDoc.name, email: userDoc.email, role: userDoc.role },
      tenant: { _id: tenantDoc._id, name: tenantDoc.name, slug: tenantDoc.slug }
    });
  } catch (e) {
    console.error('[auth/login]', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

/** Simple ping */
router.get('/ping', (_req, res) => res.json({ ok: true }));

export default router;
