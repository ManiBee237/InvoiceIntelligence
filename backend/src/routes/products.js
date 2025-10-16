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
    const tenantId = req.tenantId; // now set by middleware
    const {
      name,
      price,
      sku,
      unit,
      stock,
      taxPct,
      hsn,
      desc,
      isActive
    } = req.body || {};

    const priceNum = Number(price);
    if (!name || Number.isNaN(priceNum)) {
      return res.status(422).json({ error: 'name and numeric price are required' });
    }

    const payload = {
      tenantId,
      name: String(name).trim(),
      price: priceNum,
    };

    if (sku != null)       payload.sku = String(sku).trim();
    if (unit != null)      payload.unit = String(unit).trim();
    if (hsn != null)       payload.hsn = String(hsn).trim();
    if (desc != null)      payload.desc = String(desc);
    if (isActive != null)  payload.isActive = Boolean(isActive);

    const stockNum   = stock   == null ? undefined : Number(stock);
    const taxPctNum  = taxPct  == null ? undefined : Number(taxPct);
    if (stockNum != null && !Number.isNaN(stockNum))   payload.stock = stockNum;
    if (taxPctNum != null && !Number.isNaN(taxPctNum)) payload.taxPct = taxPctNum;

    const doc = await Product.create(payload);
    return res.status(201).json(doc);
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ error: 'Product already exists for this tenant (unique constraint)' });
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
