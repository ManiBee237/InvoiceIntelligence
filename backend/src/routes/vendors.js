import { Router } from 'express';
import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const r = Router();

const shape = (v) => (typeof v.toJSON === 'function' ? v.toJSON() : {
  id: v._id?.toString?.(),
  tenantId: v.tenantId,
  name: v.name, email: v.email, phone: v.phone, gstin: v.gstin,
  billing: v.billing || {}, shipping: v.shipping || {},
  notes: v.notes, isActive: v.isActive,
  createdAt: v.createdAt, updatedAt: v.updatedAt,
});

// LIST /api/vendors?search=&page=1&limit=20&active=true
r.get('/', asyncHandler(async (req, res) => {
  const { search = '', page = 1, limit = 20, active } = req.query;
  const p = Math.max(1, parseInt(page,10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit,10) || 20));
  const q = { tenantId: req.tenantId };
  if (search) {
    const rx = new RegExp(String(search).trim(), 'i');
    q.$or = [{ name: rx }, { email: rx }, { phone: rx }, { gstin: rx }];
  }
  if (active === 'true') q.isActive = true;
  if (active === 'false') q.isActive = false;

  const [rows, total] = await Promise.all([
    Vendor.find(q).sort({ createdAt: -1 }).skip((p-1)*l).limit(l).lean(),
    Vendor.countDocuments(q),
  ]);
  res.setHeader('x-total-count', String(total));
  res.json(rows.map(shape));
}));

// CREATE
r.post('/', asyncHandler(async (req, res) => {
  const payload = { ...req.body, tenantId: req.tenantId };
  const headerUserId = req.headers['x-user-id'];
  if (headerUserId && mongoose.Types.ObjectId.isValid(headerUserId)) {
    payload.createdBy = headerUserId;
  }
  if (!payload.name || !String(payload.name).trim()) {
    return res.status(422).json({ error: 'name required' });
  }
  const doc = await Vendor.create(payload);
  res.status(201).json(shape(doc));
}));

// READ
r.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  const doc = await Vendor.findOne({ _id: id, tenantId: req.tenantId }).lean();
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json(shape(doc));
}));

// PATCH
r.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  await Vendor.updateOne({ _id: id, tenantId: req.tenantId }, { $set: req.body || {} });
  const after = await Vendor.findOne({ _id: id, tenantId: req.tenantId }).lean();
  if (!after) return res.status(404).json({ error: 'Not found' });
  res.json(shape(after));
}));

// DELETE
r.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  const ok = await Vendor.deleteOne({ _id: id, tenantId: req.tenantId });
  if (ok.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
}));

export default r;
