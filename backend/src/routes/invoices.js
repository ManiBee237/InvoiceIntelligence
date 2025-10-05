// src/routes/invoices.js
import express from 'express';
import Invoice from '../models/Invoice.js';
import Customer from '../models/Customer.js';

const r = express.Router();

// debug ping to confirm router is mounted
r.get('/__ping', (_req, res) => res.json({ ok: true, at: '/api/invoices/__ping' }));

const computeTotal = (items = []) =>
  Math.round(items.reduce((sum, it) => {
    const up = Number(it.unitPrice) || 0;
    const q  = Number(it.qty) || 0;
    const g  = Number(it.gstPct) || 0;
    return sum + up * q * (1 + g / 100);
  }, 0));

const genInvoiceNo = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const r = Math.floor(Math.random() * 9000) + 1000;
  return `INV-${y}${m}-${r}`;
};

// GET /api/invoices?status=Open&q=...
r.get('/', async (req, res) => {
  const { q = '', status } = req.query;
  const where = { tenantId: req.tenantId, isDeleted: { $ne: true } };
  if (status && ['Open','Overdue','Paid'].includes(status)) where.status = status;
  if (q) {
    const s = String(q);
    where.$or = [
      { number:       { $regex: s, $options: 'i' } },
      { customerName: { $regex: s, $options: 'i' } },
    ];
  }
  const list = await Invoice.find(where).sort({ date: -1 }).lean();
  res.json(list);
});

// POST /api/invoices
r.post('/', async (req, res) => {
  try {
    const t = req.tenantId;
    const {
      number,
      customerId,
      customerName,
      items = [],
      issueDate,
      date,
      dueDate,
      status,
      total,
    } = req.body || {};

    // resolve customer name if only id is provided
    let cName = customerName;
    if (!cName && customerId) {
      const c = await Customer.findOne({ _id: customerId, tenantId: t, isDeleted: { $ne: true } }).lean();
      if (c) cName = c.name;
    }
    if (!cName) return res.status(400).json({ error: 'customerName or customerId required' });

    const d  = date || issueDate;
    const dd = dueDate;
    if (!d || isNaN(Date.parse(d)))  return res.status(400).json({ error: 'valid date required' });
    if (!dd || isNaN(Date.parse(dd))) return res.status(400).json({ error: 'valid dueDate required' });

    const doc = await Invoice.create({
      tenantId: t,
      number: number || genInvoiceNo(),
      customerId: customerId || null,
      customerName: cName,
      date: new Date(d),
      dueDate: new Date(dd),
      status: status && ['Open','Overdue','Paid'].includes(status) ? status : 'Open',
      items,
      total: total != null ? Number(total) : computeTotal(items),
    });

    res.json(doc.toObject());
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: 'Invoice number already exists' });
    console.error('[POST /invoices]', e); res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// PUT /api/invoices/:anyId   (by number or _id)
r.put('/:anyId', async (req, res) => {
  const { anyId } = req.params;
  const t = req.tenantId;
  const or = [{ number: anyId, tenantId: t }];
  if (/^[0-9a-fA-F]{24}$/.test(anyId)) or.push({ _id: anyId, tenantId: t });

  const payload = { ...req.body, tenantId: t };
  if (Array.isArray(payload.items)) payload.total = computeTotal(payload.items);

  try {
    const upd = await Invoice.findOneAndUpdate({ $or: or }, payload, { new: true, runValidators: true }).lean();
    if (!upd) return res.status(404).json({ error: 'Not found' });
    res.json(upd);
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: 'Invoice number already exists' });
    console.error('[PUT /invoices/:anyId]', e); res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// DELETE /api/invoices/:anyId (soft delete)
r.delete('/:anyId', async (req, res) => {
  const { anyId } = req.params;
  const t = req.tenantId;
  const or = [{ number: anyId, tenantId: t }];
  if (/^[0-9a-fA-F]{24}$/.test(anyId)) or.push({ _id: anyId, tenantId: t });
  const del = await Invoice.findOneAndUpdate({ $or: or }, { isDeleted: true }, { new: true }).lean();
  if (!del) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default r;
