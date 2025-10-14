import { Router } from 'express';
import Product from '../models/Product.js';

const r = Router();

/**
 * GET /api/products?search=&page=1&limit=20
 * Returns paginated list scoped to req.tenantId
 */
r.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const { search = '', page = 1, limit = 20 } = req.query;

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const q = { tenantId };
    if (search) {
      q.$or = [
        { name: new RegExp(search, 'i') },
        { sku:  new RegExp(search, 'i') },
        { hsn:  new RegExp(search, 'i') },
      ];
    }

    const [rows, total] = await Promise.all([
      Product.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
      Product.countDocuments(q),
    ]);

    res.setHeader('x-total-count', String(total));
    res.json(rows);
  } catch (e) { next(e); }
});

/**
 * POST /api/products
 * Body: { name, price, sku?, unit?, stock?, taxPct?, hsn?, desc?, isActive? }
 */
r.post('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const { name, price } = req.body || {};
    if (!name || typeof price !== 'number')
      return res.status(422).json({ error: 'name and numeric price are required' });

    const doc = await Product.create({ tenantId, ...req.body });
    res.status(201).json(doc);
  } catch (e) {
    // Surface duplicate key nicely (unique index on tenantId+name)
    if (e?.code === 11000) {
      return res.status(409).json({ error: 'Product with this name already exists for this tenant' });
    }
    next(e);
  }
});

/** GET /api/products/:id */
r.get('/:id', async (req, res, next) => {
  try {
    const doc = await Product.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (e) { next(e); }
});

/** PATCH /api/products/:id */
r.patch('/:id', async (req, res, next) => {
  try {
    const updated = await Product.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: req.body || {} },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ error: 'Duplicate product name for this tenant' });
    }
    next(e);
  }
});

/** DELETE /api/products/:id */
r.delete('/:id', async (req, res, next) => {
  try {
    const ok = await Product.deleteOne({ _id: req.params.id, tenantId: req.tenantId });
    if (ok.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (e) { next(e); }
});

export default r;
