// backend/src/routes/vendors.js
import { Router } from 'express';
import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const r = Router();

/* ----------------------------- safe helpers ----------------------------- */
// Never rely on toJSON (it may strip _id via transforms)
const asPlain = (v) => (v && typeof v === 'object' ? (v._doc || v) : v);
const stableId = (v) => {
  const id = v?._id ?? v?.id;
  return id ? String(id) : null;
};

/** Build a user-friendly, always-present top-level address string */
const shape = (v) => {
  const obj = asPlain(v);
  const b = obj.billing || {};
  const s = obj.shipping || {};

  const join = (o = {}) =>
    [o.address, o.line1, o.line2, o.city, o.state, o.zip ?? o.pincode]
      .filter(Boolean)
      .join(', ');

  const displayAddress =
    obj.address || b.address || join(b) || s.address || join(s) || '';

  return {
    id: stableId(obj),                  // ✅ always resolves from _id or id
    tenantId: obj.tenantId,
    name: obj.name,
    email: obj.email,
    phone: obj.phone,
    gstin: obj.gstin,
    address: displayAddress,            // ✅ flat address for UI
    billing: b,
    shipping: s,
    notes: obj.notes,
    isActive: obj.isActive,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
};

/* --------------------------------- LIST --------------------------------- */
// GET /api/vendors?search=&page=1&limit=20&active=true|false
r.get(
  '/',
  asyncHandler(async (req, res) => {
    const { search = '', page = 1, limit = 20, active } = req.query;
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'x-tenant-id required' });

    const q = { tenantId };
    if (search) {
      const rx = new RegExp(String(search).trim(), 'i');
      q.$or = [
        { name: rx },
        { email: rx },
        { phone: rx },
        { gstin: rx },
        { address: rx }, // top-level
        // nested billing/shipping fields
        { 'billing.address': rx },
        { 'billing.line1': rx },
        { 'billing.line2': rx },
        { 'billing.city': rx },
        { 'billing.state': rx },
        { 'billing.zip': rx },
        { 'billing.pincode': rx },
        { 'shipping.address': rx },
        { 'shipping.line1': rx },
        { 'shipping.line2': rx },
        { 'shipping.city': rx },
        { 'shipping.state': rx },
        { 'shipping.zip': rx },
        { 'shipping.pincode': rx },
      ];
    }
    if (active === 'true') q.isActive = true;
    if (active === 'false') q.isActive = false;

    const [rows, total] = await Promise.all([
      Vendor.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
      Vendor.countDocuments(q),
    ]);

    res.setHeader('x-total-count', String(total));
    res.json(rows.map(shape));
  })
);

/* -------------------------------- CREATE -------------------------------- */
// POST /api/vendors
r.post(
  '/',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'x-tenant-id required' });

    const payload = { ...req.body, tenantId };

    // Mirror flat address into billing.address if provided
    if (payload.address) {
      payload.billing = payload.billing || {};
      if (!payload.billing.address) payload.billing.address = String(payload.address);
    }

    const headerUserId = req.headers['x-user-id'];
    if (headerUserId && mongoose.Types.ObjectId.isValid(headerUserId)) {
      payload.createdBy = headerUserId;
    }

    if (!payload.name || !String(payload.name).trim()) {
      return res.status(422).json({ error: 'name required' });
    }

    const doc = await Vendor.create(payload);
    // Use raw doc so _id is guaranteed present
    res.status(201).json(shape(doc));
  })
);

/* --------------------------------- READ --------------------------------- */
// GET /api/vendors/:id
r.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'x-tenant-id required' });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const doc = await Vendor.findOne({ _id: id, tenantId }).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(shape(doc));
  })
);

/* ------------------------------- UPDATE --------------------------------- */
// shared updater for PATCH/PUT
async function updateVendor(req, res) {
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'x-tenant-id required' });

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const body = req.body || {};
  const $set = { ...body };

  // If client sent flat address, mirror into billing.address
  if (Object.prototype.hasOwnProperty.call(body, 'address')) {
    $set.billing = $set.billing || {};
    if (!$set.billing.address) $set.billing.address = String(body.address || '');
  }

  await Vendor.updateOne({ _id: id, tenantId }, { $set });
  const after = await Vendor.findOne({ _id: id, tenantId }).lean();
  if (!after) return res.status(404).json({ error: 'Not found' });
  res.json(shape(after));
}

// PATCH /api/vendors/:id
r.patch('/:id', asyncHandler(updateVendor));

// PUT /api/vendors/:id  (same semantics as PATCH for now)
r.put('/:id', asyncHandler(updateVendor));

/* -------------------------------- DELETE -------------------------------- */
// DELETE /api/vendors/:id
r.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'x-tenant-id required' });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const ok = await Vendor.deleteOne({ _id: id, tenantId });
    if (ok.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  })
);

export default r;
