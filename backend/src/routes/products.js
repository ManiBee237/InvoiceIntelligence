// backend/src/routes/products.js
import express from 'express';
import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Counter from '../models/Counter.js';
import { withTenant } from '../middleware/tenant.js';

const router = express.Router();

const toNum = (v, def = 0) => {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : def;
};

async function nextProductCode(tenantId) {
  const yyyymm = new Date().toISOString().slice(0,7).replace('-', '');
  const key = `PROD-${yyyymm}`;
  const doc = await Counter.findOneAndUpdate(
    { tenantId, key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const seq = String(doc.seq).padStart(4, '0');
  return `${key}-${seq}`;
}

/* ------------------------------- CREATE ---------------------------------- */
// CREATE (robust, auto-bump code if client didn't set one)
router.post('/', withTenant, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const b = req.body || {};

    const name = (b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });

    // Was code explicitly provided by client?
    const clientCodeRaw = (b.code || b.id || b.sku || '').trim();
    const clientProvidedCode = !!clientCodeRaw;

    // Build the doc fields (without code yet)
    const baseDoc = {
      tenantId,
      name,
      sku: (b.sku || '').trim() || undefined,
      unit: (b.unit || b.uom || 'unit').trim(),
      unitPrice: toNum(b.unitPrice ?? b.price ?? b.rate, 0),
      gst: toNum(b.gst ?? b.gstPct ?? b.tax, 0),
      description: b.description || b.desc || '',
      active: b.active === false ? false : true,
    };

    // If client provided a code, try once and surface 409 if dup
    if (clientProvidedCode) {
      try {
        const doc = await Product.create({ ...baseDoc, code: clientCodeRaw });
        return res.status(201).json(doc);
      } catch (e) {
        if (e?.code === 11000) {
          return res.status(409).json({ error: 'Duplicate product code', code: clientCodeRaw });
        }
        throw e;
      }
    }

    // Otherwise, we own code generation: retry on dup a few times
    const MAX_TRIES = 5;
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      const code = await nextProductCode(tenantId);
      try {
        const doc = await Product.create({ ...baseDoc, code });
        return res.status(201).json(doc);
      } catch (e) {
        if (e?.code === 11000) {
          // Someone else grabbed that code concurrently; try another
          if (attempt === MAX_TRIES) {
            return res.status(409).json({ error: 'Duplicate product code after retries', code });
          }
          continue;
        }
        throw e; // different error -> bubble up
      }
    }
  } catch (e) {
    console.error('[products:create]', e);
    return res.status(500).json({ error: 'Failed to create product' });
  }
});


/* -------------------------------- LIST ----------------------------------- */
router.get('/', withTenant, async (req, res) => {
  try {
    const { q = '', limit = 500, active } = req.query;
    const and = [];

    if (q) {
      const re = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      and.push({ $or: [{ name: re }, { code: re }, { sku: re }, { description: re }] });
    }
    if (active === 'true') and.push({ active: true });
    if (active === 'false') and.push({ active: false });

    const query = and.length ? { $and: and } : {};
    const rows = await Product.find(req.scoped(query))
      .sort({ updatedAt: -1 })
      .limit(Math.min(Number(limit) || 500, 2000))
      .lean();

    res.json(rows);
  } catch (e) {
    console.error('[products:list]', e);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/* ------------------------------- UPDATE ---------------------------------- */
router.put('/:id', withTenant, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

    const b = req.body || {};
    const patch = {
      name: (b.name ?? undefined),
      code: (b.code ?? undefined),
      sku: (b.sku ?? undefined),
      unit: (b.unit ?? b.uom ?? undefined),
      unitPrice: b.unitPrice != null ? toNum(b.unitPrice, 0) : undefined,
      gst: b.gst != null ? toNum(b.gst, 0) : undefined,
      description: (b.description ?? b.desc ?? undefined),
      active: (typeof b.active === 'boolean' ? b.active : undefined),
    };

    const doc = await Product.findOneAndUpdate(
      req.scoped({ _id: id }),
      { $set: patch },
      { new: true, runValidators: true }
    );

    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ error: 'Duplicate product (unique index)', details: e?.keyValue });
    }
    console.error('[products:update]', e);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

/* ------------------------------- DELETE ---------------------------------- */
router.delete('/:id', withTenant, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

    const doc = await Product.findOneAndDelete(req.scoped({ _id: id }));
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[products:delete]', e);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

export default router;
