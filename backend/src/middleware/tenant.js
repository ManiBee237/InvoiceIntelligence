// src/middleware/tenant.js
import mongoose from 'mongoose';
import Tenant from '../models/Tenant.js';

const { isValidObjectId, connection } = mongoose;
const tenantCache = new Map(); // key -> {_id, slug, code, name}

const devMode = () => process.env.NODE_ENV !== 'production';

export function getTenantId(req) {
  return req.header('x-tenant-id') || req.header('x-tenant') || req.tenantId || null;
}

async function findTenant(identifier) {
  const key = String(identifier).trim().toLowerCase();
  if (tenantCache.has(key)) return tenantCache.get(key);
  const doc = await Tenant.findByAny(key);
  if (doc) tenantCache.set(key, doc);
  return doc;
}

export async function tenantMiddleware(req, res, next) {
  try {
    if (connection.readyState !== 1) {
      const msg = `DB not connected (readyState=${connection.readyState}).`;
      return res.status(503).json(devMode() ? { error: msg } : { error: 'Service unavailable' });
    }

    const incoming = getTenantId(req);
    if (!incoming) return res.status(400).json({ error: 'Missing x-tenant-id' });

    // Accept raw ObjectId header
    if (isValidObjectId(incoming)) {
      req.tenantId = incoming;
      req.tenant = { _id: incoming };
      return next();
    }

    // Resolve by slug/code
    let t = await findTenant(incoming);

    // Auto-create in dev (or when explicitly allowed)
    const allowAuto = process.env.AUTO_CREATE_TENANT === '1' || devMode();
    if (!t && allowAuto) {
      const slug = String(incoming).trim().toLowerCase();
      t = await Tenant.create({ slug, code: slug, name: `${slug} (auto)` });
      tenantCache.set(slug, t);
      if (devMode()) console.log('[tenant] auto-created:', t._id, t.slug);
    }

    if (!t) return res.status(400).json({ error: `Unknown tenant "${incoming}"` });

    req.tenantId = String(t._id);
    req.tenant = { _id: String(t._id), slug: t.slug, code: t.code, name: t.name };
    return next();
  } catch (err) {
    console.error('[tenantMiddleware] error:', err);
    return res.status(500).json(
      devMode()
        ? { error: 'Tenant resolution failed', reason: String(err?.message || err) }
        : { error: 'Tenant resolution failed' }
    );
  }
}

export function withTenant(handler) {
  return async (req, res, next) => {
    try {
      if (!req.tenantId) {
        await tenantMiddleware(req, res, (err) => (err ? next(err) : null));
        if (!req.tenantId) return; // response already sent
      }
      return await handler(req, res, next);
    } catch (e) {
      next(e);
    }
  };
}

export function ensureTenant(filter = {}, reqOrId) {
  const id = typeof reqOrId === 'string'
    ? reqOrId
    : (reqOrId?.tenantId || getTenantId(reqOrId));
  if (!id) throw new Error('ensureTenant: missing tenant id');
  return { ...filter, tenantId: id };
}
