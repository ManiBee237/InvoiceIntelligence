import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Tenant from '../models/Tenant.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const r = Router();

function signToken(user, tenantSlug) {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
  return jwt.sign(
    { sub: user.id, tenantId: tenantSlug, role: user.role },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

/**
 * POST /api/auth/register
 * body: { name, email, password, tenantSlug?, tenantName? }
 * - If tenantSlug exists → use it; else create a tenant from body / header.
 * - First user of a tenant becomes 'owner'.
 */
r.post('/register', asyncHandler(async (req, res) => {
  let { name, email, password, tenantSlug, tenantName } = req.body || {};
  email = (email || '').trim().toLowerCase();
  if (!name || !email || !password) return res.status(422).json({ error: 'name, email, password required' });

  // Favor body, fall back to header (x-tenant-id), else throw
  tenantSlug = (tenantSlug || req.headers['x-tenant-id'] || '').toString().trim().toLowerCase();
  if (!tenantSlug) {
    if (!tenantName) return res.status(422).json({ error: 'tenantSlug or tenantName required' });
    tenantSlug = tenantName.trim().toLowerCase().replace(/\s+/g, '-');
  }

  // find or create tenant
  let tenant = await Tenant.findOne({ slug: tenantSlug }).lean();
  if (!tenant) {
    tenant = (await Tenant.create({ slug: tenantSlug, name: tenantName || tenantSlug }))?.toJSON();
  }

  // role owner if first user in this tenant
  const existingUsers = await User.countDocuments({ tenantId: tenant.slug });
  const role = existingUsers === 0 ? 'owner' : 'staff';

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ tenantId: tenant.slug, name, email, role, passwordHash });

  const token = signToken(user.toJSON(), tenant.slug);
  return res.status(201).json({ token, user: user.toJSON(), tenant });
}));

/**
 * POST /api/auth/login
 * body: { email, password, tenantSlug? }
 */
r.post('/login', asyncHandler(async (req, res) => {
  let { email, password, tenantSlug } = req.body || {};
  email = (email || '').trim().toLowerCase();

  tenantSlug = (tenantSlug || req.headers['x-tenant-id'] || '').toString().trim().toLowerCase();
  if (!email || !password || !tenantSlug) {
    return res.status(422).json({ error: 'email, password, tenantSlug required' });
  }

  const tenant = await Tenant.findOne({ slug: tenantSlug }).lean();
  if (!tenant) return res.status(400).json({ error: 'Tenant not found' });

  const user = await User.findOne({ tenantId: tenant.slug, email }).select('+passwordHash');
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.passwordHash || '');
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signToken(user.toJSON(), tenant.slug);
  return res.json({ token, user: user.toJSON(), tenant });
}));

export default r;
