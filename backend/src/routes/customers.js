// src/routes/customers.js
import { Router } from 'express';
import mongoose from 'mongoose';
import Customer from '../models/Customer.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const r = Router();

const shape = (c) => {
  const x = typeof c.toJSON === 'function' ? c.toJSON() : c;
  return {
    id: x.id || x._id?.toString(),
    tenantId: x.tenantId,
    name: x.name,
    email: x.email,
    phone: x.phone,
    gstin: x.gstin,
    billing: x.billing || {},
    shipping: x.shipping || {},
    notes: x.notes,
    isActive: x.isActive,
    createdAt: x.createdAt,
    updatedAt: x.updatedAt,
  };
};

// LIST: /api/customers?search=&page=1&limit=20
r.get(
  '/',
  asyncHandler(async (req, res) => {
    const { search = '', page = 1, limit = 20 } = req.query;
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const q = { tenantId: req.tenantId };
    if (search) {
      const rx = new RegExp(String(search).trim(), 'i');
      q.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }

    const [rows, total] = await Promise.all([
      Customer.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
      Customer.countDocuments(q),
    ]);
    res.setHeader('x-total-count', String(total));
    res.json(rows.map(shape));
  })
);

// CREATE
r.post(
  '/',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;

    // ⬇️ moved inside the handler so `req` exists
    const headerUserId = req.headers['x-user-id'];
    const payload = { ...req.body, tenantId };
    if (headerUserId && mongoose.Types.ObjectId.isValid(headerUserId)) {
      payload.createdBy = headerUserId;
    }

    const doc = await Customer.create(payload);
    res.status(201).json(shape(doc));
  })
);

// READ
r.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
    const doc = await Customer.findOne({ _id: id, tenantId: req.tenantId }).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(shape(doc));
  })
);

// PATCH
r.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
    await Customer.updateOne({ _id: id, tenantId: req.tenantId }, { $set: req.body || {} });
    const after = await Customer.findOne({ _id: id, tenantId: req.tenantId }).lean();
    if (!after) return res.status(404).json({ error: 'Not found' });
    res.json(shape(after));
  })
);

// DELETE
r.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
    const ok = await Customer.deleteOne({ _id: id, tenantId: req.tenantId });
    if (ok.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  })
);

export default r;
