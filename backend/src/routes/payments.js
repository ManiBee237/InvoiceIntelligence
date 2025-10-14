import { Router } from 'express';
import mongoose from 'mongoose';
import Payment from '../models/Payment.js';
import Invoice from '../models/Invoice.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const r = Router();
const isId = (s) => typeof s === 'string' && /^[a-f\d]{24}$/i.test(s);

// escape for regex
const re = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const shape = (p) => {
  if (p && typeof p.toJSON === 'function') return p.toJSON();
  const o = { ...p };
  o.id = o.id || o._id?.toString?.();
  if (o.date instanceof Date) o.date = o.date.toISOString().slice(0,10);
  delete o._id; delete o.__v;
  return o;
};

// recompute invoice status
async function recomputeInvoiceStatus(tenantId, invoiceId) {
  const inv = await Invoice.findOne({ _id: invoiceId, tenantId }).lean();
  if (!inv) return;
  const totals = await Payment.aggregate([
    { $match: { tenantId, invoiceId: new mongoose.Types.ObjectId(invoiceId) } },
    { $group: { _id: '$invoiceId', paid: { $sum: '$amount' } } }
  ]);
  const paid = Number(totals?.[0]?.paid || 0);
  const next = paid >= (inv.total || 0) ? 'paid' : 'sent';
  await Invoice.updateOne({ _id: invoiceId, tenantId }, { $set: { status: next } });
}

/* ---------- LIST ---------- */
r.get('/', asyncHandler(async (req, res) => {
  const TENANT = req.tenantId;
  const { invoiceId, page = 1, limit = 50 } = req.query;
  const p = Math.max(1, parseInt(page,10) || 1);
  const l = Math.min(200, Math.max(1, parseInt(limit,10) || 50));

  const q = { tenantId: TENANT };
  if (invoiceId && isId(invoiceId)) q.invoiceId = invoiceId;

  const [rows, total] = await Promise.all([
    Payment.find(q).sort({ date: -1, createdAt: -1 }).skip((p-1)*l).limit(l).lean(),
    Payment.countDocuments(q)
  ]);

  res.setHeader('x-total-count', String(total));
  res.json(rows.map(shape));
}));

/* ---------- CREATE ---------- */
r.post('/', asyncHandler(async (req, res) => {
  const TENANT = req.tenantId;
  let { invoiceId, invoiceNo, number, amount, date, method, notes, invoice } = req.body || {};

  // normalize amount
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(422).json({ error: 'invoiceId and numeric amount required' });
  }

  // gather possible number strings
  const rawNo = (invoiceNo ?? number ?? invoice?.invoiceNo ?? '').toString().trim();

  // resolve invoiceId if not provided
  let invDoc = null;
  if (!invoiceId) {
    if (rawNo) {
      // 1) exact match first
      invDoc = await Invoice.findOne({ tenantId: TENANT, invoiceNo: rawNo }).lean();
      // 2) if not found, try a safe "starts with" (prefix) match
      if (!invDoc) {
        const rx = new RegExp('^' + re(rawNo));
        invDoc = await Invoice.findOne({ tenantId: TENANT, invoiceNo: rx }).lean();
      }
      if (invDoc) invoiceId = invDoc._id.toString();
      else return res.status(404).json({ error: 'invoiceNo not found for tenant', invoiceNo: rawNo });
    }
  }

  // validate invoiceId
  if (!invoiceId || !isId(String(invoiceId))) {
    return res.status(422).json({ error: 'invoiceId and numeric amount required' });
  }

  // ensure belongs to tenant (if we didn't already load it)
  if (!invDoc) {
    invDoc = await Invoice.findOne({ _id: invoiceId, tenantId: TENANT }).lean();
    if (!invDoc) return res.status(400).json({ error: 'Invalid invoice for tenant' });
  }

  // normalize date
  let when = date ? new Date(date) : new Date();
  if (Number.isNaN(when.getTime())) when = new Date();

  // create payment
  const created = await Payment.create({
    tenantId: TENANT,
    invoiceId,
    amount: amt,
    date: when,
    method: method || undefined,
    notes: notes || undefined,
  });

  await recomputeInvoiceStatus(TENANT, invoiceId);
  res.status(201).json(shape(created));
}));

/* ---------- DELETE ---------- */
r.delete('/:id', asyncHandler(async (req, res) => {
  const TENANT = req.tenantId;
  const { id } = req.params;
  if (!isId(id)) return res.status(400).json({ error: 'Invalid id' });

  const pay = await Payment.findOneAndDelete({ _id: id, tenantId: TENANT }).lean();
  if (!pay) return res.status(404).json({ error: 'Not found' });

  await recomputeInvoiceStatus(TENANT, pay.invoiceId.toString());
  res.status(204).end();
}));

export default r;
