import express from 'express';
import Payment from '../models/Payment.js';
import Customer from '../models/Customer.js';

const router = express.Router();

// GET /api/payments?limit=500&method=UPI&from=2025-10-01&to=2025-10-06&q=acme
router.get('/', async (req, res) => {
  try {
    const { limit = 100, method, from, to, q } = req.query;
    const cond = { tenantId: req.tenantId, isDeleted: { $ne: true } };

    if (method && method !== 'All') cond.method = method;
    if (from || to) {
      cond.date = {};
      if (from) cond.date.$gte = new Date(from);
      if (to) cond.date.$lte = new Date(to);
    }
    if (q) {
      const rx = new RegExp(String(q), 'i');
      cond.$or = [{ customer: rx }, { invoice: rx }, { id: rx }];
    }

    const rows = await Payment.find(cond)
      .sort({ date: -1, _id: -1 })
      .limit(Math.max(1, Math.min(1000, Number(limit))));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// POST /api/payments
router.post('/', async (req, res) => {
  try {
    const b = req.body || {};

    // generate an id if missing (PM-YYMMDD-####)
    const genId = () => {
      const d = new Date();
      const yy = String(d.getFullYear()).slice(-2);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const r = String(Math.floor(Math.random() * 9000) + 1000);
      return `PM-${yy}${mm}${dd}-${r}`;
    };

    let customerName = b.customer || '';
    if (b.customerId && !customerName) {
      const cust = await Customer.findOne({ _id: b.customerId, tenantId: req.tenantId }, { name: 1 });
      if (cust) customerName = cust.name;
    }

    const doc = await Payment.create({
      tenantId: req.tenantId,
      id: b.id || genId(),
      customerId: b.customerId || null,
      customer: customerName || 'Unknown',
      invoice: b.invoice || '',
      date: b.date ? new Date(b.date) : new Date(),
      method: b.method || 'UPI',
      amount: Number(b.amount) || 0,
    });

    res.status(201).json(doc);
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: 'Payment ID already exists' });
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// PUT /api/payments/:id  (id can be _id or human id)
router.put('/:id', async (req, res) => {
  try {
    const key = req.params.id;
    const doc = await Payment.findOneAndUpdate(
      { tenantId: req.tenantId, $or: [{ _id: key }, { id: key }] },
      req.body,
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: 'Payment ID already exists' });
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// DELETE /api/payments/:id  (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const key = req.params.id;
    const doc = await Payment.findOneAndUpdate(
      { tenantId: req.tenantId, $or: [{ _id: key }, { id: key }] },
      { isDeleted: true },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

export default router;
