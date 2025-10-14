// backend/src/routes/invoices.js
import express from 'express';
import mongoose from 'mongoose';
import Invoice from '../models/Invoice.js';  // <-- lowercase file name with .js

const Customer = mongoose.models.Customer || mongoose.model('Customer');
const router = express.Router();

const isId = (s) => typeof s === 'string' && /^[a-f\d]{24}$/i.test(s);
const ALLOWED = new Set(['open', 'overdue', 'paid']);
const normStatus = (s) => {
  const v = String(s || '').trim().toLowerCase();
  return ALLOWED.has(v) ? v : null;
};
const title = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

// GET /api/invoices
router.get('/', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'];
    if (!tenantId) return res.status(400).json({ error: 'x-tenant-id required' });

    const { status, q, limit = 500, offset = 0 } = req.query;
    const find = { tenantId };

    if (status && String(status).toLowerCase() !== 'all') {
      const s = normStatus(status);
      if (!s && String(status).toLowerCase() === 'overdue') {
        const today = new Date(new Date().toDateString());
        find.$or = [
          { status: 'overdue' },
          { $and: [{ status: { $ne: 'paid' } }, { dueDate: { $lt: today } }] },
        ];
      } else if (s) {
        find.status = s;
      } else {
        return res.status(422).json({ error: 'Invalid status filter' });
      }
    }

    if (q && String(q).trim()) {
      const s = String(q).trim();
      find.$or = [
        { number: { $regex: s, $options: 'i' } },
        { invoiceNo: { $regex: s, $options: 'i' } },
        { customerName: { $regex: s, $options: 'i' } },
      ];
    }

    const docs = await Invoice.find(find)
      .sort({ invoiceDate: -1, createdAt: -1 })
      .skip(Math.max(+offset || 0, 0))
      .limit(Math.min(+limit || 500, 1000))
      .lean();

    const out = docs.map((d) => ({
      id: String(d._id),
      number: d.number || d.invoiceNo || '',
      customerName: d.customerName || '',
      total: Number(d.total) || 0,
      date: d.invoiceDate || d.createdAt,
      dueDate: d.dueDate || null,
      status: title(d.status || 'open'),
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));

    res.setHeader('x-total-count', String(out.length));
    return res.json(out);
  } catch (e) {
    console.error('[invoices] list error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/invoices
router.post('/', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'];
    if (!tenantId) return res.status(400).json({ error: 'x-tenant-id required' });

    const body = req.body || {};
    let {
      customerId, customerName,
      invoiceNo, number,
      invoiceDate, date,
      dueDate,
      lines,
      tax,
      status,
    } = body;

    // resolve customer
    let custId = isId(customerId) ? customerId : null;
    let custName = (customerName || '').trim();
    if (!custId && custName) {
      const c = await (Customer?.findOne ? Customer.findOne({ tenantId, name: custName }) : null);
      if (c) custId = String(c._id);
    }
    if (!custId && !custName) {
      return res.status(422).json({ error: 'customerId invalid and no customerName provided' });
    }

    const invDate = date || invoiceDate || new Date();
    const normLines = Array.isArray(lines) ? lines.map((l) => ({
      description: l.description || '',
      qty: Number(l.qty) || 0,
      rate: Number(l.rate) || 0,
    })) : [];
    const subtotal = normLines.reduce((s, l) => s + (l.qty * l.rate), 0);
    const taxNum = Number(tax) || 0;
    const total = subtotal + taxNum;
    const stat = normStatus(status) || 'open';

    const doc = await Invoice.create({
      tenantId,
      customerId: custId || undefined,
      customerName: custName || undefined,
      number: number || invoiceNo || undefined,
      invoiceNo: number || invoiceNo || undefined,
      invoiceDate: invDate,
      dueDate: dueDate || undefined,
      lines: normLines,
      subtotal,
      tax: taxNum,
      total,
      status: stat,
    });

    return res.status(201).json({
      id: String(doc._id),
      number: doc.number || doc.invoiceNo || '',
      customerName: doc.customerName || '',
      total: Number(doc.total) || 0,
      date: doc.invoiceDate,
      dueDate: doc.dueDate || null,
      status: title(doc.status),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (e) {
    if (e?.name === 'ValidationError') {
      const msg = Object.values(e.errors).map((x) => x.message).join('; ') || 'Validation error';
      return res.status(422).json({ error: msg });
    }
    console.error('[invoices] create error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/invoices/:id
router.put('/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'];
    if (!tenantId) return res.status(400).json({ error: 'x-tenant-id required' });
    const { id } = req.params;
    if (!isId(id)) return res.status(404).json({ error: 'Not found' });

    const body = req.body || {};
    const update = {};

    if (body.number || body.invoiceNo) {
      update.number = body.number || body.invoiceNo;
      update.invoiceNo = update.number;
    }
    if (body.invoiceDate || body.date) update.invoiceDate = body.invoiceDate || body.date;
    if (body.dueDate !== undefined) update.dueDate = body.dueDate || null;

    if (Array.isArray(body.lines)) {
      const normLines = body.lines.map((l) => ({
        description: l.description || '',
        qty: Number(l.qty) || 0,
        rate: Number(l.rate) || 0,
      }));
      const subtotal = normLines.reduce((s, l) => s + (l.qty * l.rate), 0);
      const taxNum = Number(body.tax ?? 0) || 0;
      update.lines = normLines;
      update.subtotal = subtotal;
      update.tax = taxNum;
      update.total = subtotal + taxNum;
    } else if (body.tax !== undefined) {
      update.tax = Number(body.tax) || 0;
    }

    if (body.status !== undefined) {
      const s = normStatus(body.status);
      if (!s) return res.status(422).json({ error: 'Invalid status' });
      update.status = s;
    }

    if (body.customerId && isId(body.customerId)) {
      update.customerId = body.customerId;
      if (body.customerName !== undefined) update.customerName = String(body.customerName || '').trim();
    } else if (body.customerName !== undefined) {
      update.customerName = String(body.customerName || '').trim();
      update.customerId = undefined;
    }

    const doc = await Invoice.findOneAndUpdate(
      { _id: id, tenantId },
      update,
      { new: true, runValidators: true }
    ).lean();

    if (!doc) return res.status(404).json({ error: 'Not found' });

    return res.json({
      id: String(doc._id),
      number: doc.number || doc.invoiceNo || '',
      customerName: doc.customerName || '',
      total: Number(doc.total) || 0,
      date: doc.invoiceDate,
      dueDate: doc.dueDate || null,
      status: title(doc.status),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (e) {
    if (e?.name === 'ValidationError') {
      const msg = Object.values(e.errors).map((x) => x.message).join('; ') || 'Validation error';
      return res.status(422).json({ error: msg });
    }
    console.error('[invoices] update error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/invoices/:id
router.delete('/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'];
    if (!tenantId) return res.status(400).json({ error: 'x-tenant-id required' });
    const { id } = req.params;
    if (!isId(id)) return res.status(404).json({ error: 'Not found' });

    const r = await Invoice.deleteOne({ _id: id, tenantId });
    if (!r.deletedCount) return res.status(404).json({ error: 'Not found' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[invoices] delete error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
