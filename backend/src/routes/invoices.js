// backend/src/routes/invoices.js
import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

// --- helpers ---
const isId = (s) => typeof s === 'string' && /^[a-f\d]{24}$/i.test(s);

const ALLOWED_STATUS = new Set(['draft', 'sent', 'open', 'paid', 'void']);
// Note: "overdue" is computed (dueDate < today && not paid)
// so we don't store it; we only allow filtering by it.

const normStatus = (s) => {
  if (!s) return null;
  const v = String(s).trim().toLowerCase();
  return ALLOWED_STATUS.has(v) ? v : null;
};

const title = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

// --- Mongoose models (lightweight require to avoid circulars) ---
const Invoice = mongoose.model('Invoice');
const Customer = mongoose.model('Customer');

// --- GET /api/invoices ---
router.get('/', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'];
    if (!tenantId) return res.status(400).json({ error: 'x-tenant-id required' });

    const { status, q, limit = 200, offset = 0 } = req.query;
    const lim = Math.min(Number(limit) || 200, 1000);
    const off = Math.max(Number(offset) || 0, 0);

    const find = { tenantId };

    // status filter (case-insensitive)
    if (status) {
      const sRaw = String(status).trim().toLowerCase();
      if (sRaw === 'overdue') {
        // computed overdue: not paid & dueDate < today
        const todayMid = new Date(new Date().toDateString());
        find.status = { $ne: 'paid' };
        find.dueDate = { $lt: todayMid };
      } else if (ALLOWED_STATUS.has(sRaw)) {
        find.status = sRaw;
      } else if (sRaw !== 'all') {
        return res.status(422).json({ error: 'Invalid status filter' });
      }
    }

    // q search on number + customerName (if provided)
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
      .skip(off)
      .limit(lim)
      .lean();

    const out = docs.map(d => ({
      id: String(d._id),
      number: d.number || d.invoiceNo || '',
      customerName: d.customerName || '',
      total: Number(d.total) || 0,
      date: d.date || d.invoiceDate || d.createdAt,
      dueDate: d.dueDate || null,
      status: title(d.status || 'open'),
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));

    res.setHeader('x-total-count', String(out.length));
    return res.json(out);
  } catch (e) {
    console.error('[invoices] list error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// --- POST /api/invoices ---
router.post('/', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'];
    if (!tenantId) return res.status(400).json({ error: 'x-tenant-id required' });

    const body = req.body || {};
    let { customerId, customerName, invoiceNo, number, invoiceDate, date, dueDate, lines, tax, status } = body;

    // customer resolution (id or name)
    let custId = isId(customerId) ? customerId : null;
    let custName = (customerName || '').trim();

    if (!custId && custName) {
      // try find existing
      const c = await Customer.findOne({ tenantId, name: custName }).lean();
      if (c) custId = String(c._id);
    }

    if (!custId && !custName) {
      return res.status(422).json({ error: 'customerId invalid and no customerName provided' });
    }

    const invDate = date || invoiceDate || new Date();
    const stat = normStatus(status) || 'open';

    // compute totals (simple: sum qty*rate + tax)
    const safeLines = Array.isArray(lines) ? lines : [];
    const subtotal = safeLines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);
    const taxNum = Number(tax) || 0;
    const total = subtotal + taxNum;

    const doc = await Invoice.create({
      tenantId,
      customerId: custId || undefined,
      customerName: custName || undefined,
      number: number || invoiceNo || undefined,
      invoiceNo: number || invoiceNo || undefined,
      invoiceDate: invDate,
      dueDate: dueDate || undefined,
      lines: safeLines.map(l => ({ description: l.description || '', qty: Number(l.qty) || 0, rate: Number(l.rate) || 0 })),
      subtotal, tax: taxNum, total,
      status: stat,
    });

    return res.status(201).json({
      id: String(doc._id),
      number: doc.number || doc.invoiceNo || '',
      customerName: doc.customerName || '',
      total: Number(doc.total) || 0,
      date: doc.date || doc.invoiceDate || doc.createdAt,
      dueDate: doc.dueDate || null,
      status: title(doc.status || 'open'),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (e) {
    console.error('[invoices] create error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// --- PUT /api/invoices/:id ---
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
      update.lines = body.lines.map(l => ({ description: l.description || '', qty: Number(l.qty) || 0, rate: Number(l.rate) || 0 }));
      const subtotal = update.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);
      const taxNum = Number(body.tax ?? 0) || 0;
      update.subtotal = subtotal;
      update.tax = taxNum;
      update.total = subtotal + taxNum;
    } else if (body.tax !== undefined) {
      const taxNum = Number(body.tax) || 0;
      update.tax = taxNum;
    }

    if (body.status !== undefined) {
      // normalize; ignore "overdue" on write (it's derived)
      const s = normStatus(body.status);
      if (s) update.status = s;
    }

    if (body.customerId && isId(body.customerId)) {
      update.customerId = body.customerId;
      // optional customerName keep if provided
      if (body.customerName) update.customerName = String(body.customerName).trim();
    } else if (body.customerName) {
      update.customerName = String(body.customerName).trim();
      update.customerId = undefined;
    }

    const doc = await Invoice.findOneAndUpdate({ _id: id, tenantId }, update, { new: true }).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });

    return res.json({
      id: String(doc._id),
      number: doc.number || doc.invoiceNo || '',
      customerName: doc.customerName || '',
      total: Number(doc.total) || 0,
      date: doc.date || doc.invoiceDate || doc.createdAt,
      dueDate: doc.dueDate || null,
      status: title(doc.status || 'open'),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (e) {
    console.error('[invoices] update error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// --- DELETE /api/invoices/:id ---
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
    console.error('[invoices] delete error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
