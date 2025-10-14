import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const r = Router();

const shape = (u) => (typeof u.toJSON === 'function' ? u.toJSON() : u);

// LIST: /api/users?search=&page=1&limit=20
r.get('/', asyncHandler(async (req, res) => {
  const { search = '', page = 1, limit = 20 } = req.query;
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const q = { tenantId: req.tenantId };
  if (search) {
    const rx = new RegExp(String(search).trim(), 'i');
    q.$or = [{ name: rx }, { email: rx }, { role: rx }];
  }

  const [rows, total] = await Promise.all([
    User.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
    User.countDocuments(q),
  ]);

  res.setHeader('x-total-count', String(total));
  res.json(rows.map(shape));
}));

// CREATE
r.post('/', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const payload = { ...req.body, tenantId };
  const created = await User.create(payload);
  res.status(201).json(shape(created));
}));

// READ
r.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  const doc = await User.findOne({ _id: id, tenantId: req.tenantId }).lean();
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json(shape(doc));
}));

// PATCH
r.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  await User.updateOne({ _id: id, tenantId: req.tenantId }, { $set: req.body || {} });
  const after = await User.findOne({ _id: id, tenantId: req.tenantId }).lean();
  if (!after) return res.status(404).json({ error: 'Not found' });
  res.json(shape(after));
}));

// DELETE
r.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  const ok = await User.deleteOne({ _id: id, tenantId: req.tenantId });
  if (ok.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
}));

export default r;
