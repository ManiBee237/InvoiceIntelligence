import Tenant from '../models/Tenant.js';

export async function tenantMiddleware(req, res, next) {
  const raw = req.header('x-tenant-id');
  if (!raw) return res.status(400).json({ error: 'Missing x-tenant-id' });

  // accept either ObjectId or slug; prefer slug for dev (e.g., "demo")
  let tenant = null;

  // try slug first
  tenant = await Tenant.findOne({ slug: raw, isDeleted: { $ne: true } }).lean();

  // if not slug, try _id
  if (!tenant && /^[0-9a-fA-F]{24}$/.test(raw)) {
    tenant = await Tenant.findOne({ _id: raw, isDeleted: { $ne: true } }).lean();
  }

  // dev convenience: auto-create if missing & value looks like a slug
  if (!tenant && !/^[0-9a-fA-F]{24}$/.test(raw)) {
    const doc = await Tenant.create({ slug: raw, name: raw.toUpperCase() });
    tenant = doc.toObject();
  }

  if (!tenant) return res.status(404).json({ error: 'Invalid tenant' });

  req.tenantId = tenant._id;
  req.tenant   = tenant;
  next();
}
