import { Router } from 'express';
import mongoose from 'mongoose';
import Invoice from '../models/Invoice.js';
import Customer from '../models/Customer.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const r = Router();

const STATUS = new Set(['draft','sent','paid','void']);
const MAP = new Map([['open','sent'],['unpaid','sent'],['outstanding','sent'],['issued','sent'],['settled','paid'],['completed','paid'],['cancelled','void'],['canceled','void'],['voided','void']]);
const normStatus = s => { if (s==null) return null; const v=String(s).trim().toLowerCase(); const m=MAP.get(v)||v; return STATUS.has(m)?m:null; };
const normDate = d => { if (!d) return null; const t=d instanceof Date?d:new Date(d); return isNaN(t.getTime())?null:t.toISOString().slice(0,10); };
const autoNo = () => { const d=new Date(); return `INV-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.floor(Math.random()*900)+100}`; };

const shape = (inv) => {
  const x = typeof inv.toJSON === 'function' ? inv.toJSON() : inv;
  return {
    id: x.id || x._id?.toString(),
    tenantId: x.tenantId,
    customerId: typeof x.customerId === 'object' ? x.customerId._id?.toString?.() : x.customerId,
    customerName: typeof x.customerId === 'object' ? (x.customerId.name || null) : null,
    invoiceNo: x.invoiceNo,
    invoiceDate: typeof x.invoiceDate === 'string' ? x.invoiceDate
      : x.invoiceDate instanceof Date ? x.invoiceDate.toISOString().slice(0,10) : x.invoiceDate,
    lines: x.lines || [], subtotal: x.subtotal, tax: x.tax, total: x.total, status: x.status,
    createdAt: x.createdAt, updatedAt: x.updatedAt,
  };
};

/* LIST */
r.get('/', asyncHandler(async (req, res) => {
  const TENANT = req.tenantId;
  const { page=1, limit=20, status } = req.query;
  const p = Math.max(1, parseInt(page,10)||1);
  const l = Math.min(100, Math.max(1, parseInt(limit,10)||20));
  const q = { tenantId: TENANT };
  if (status != null && String(status).trim() !== '') {
    const s = normStatus(status); if (!s) return res.status(422).json({ error: 'status invalid' }); q.status = s;
  }
  const [rows, total] = await Promise.all([
    Invoice.find(q).populate({ path: 'customerId', select: 'name email phone' })
      .sort({ createdAt:-1 }).skip((p-1)*l).limit(l).lean(),
    Invoice.countDocuments(q),
  ]);
  res.setHeader('x-total-count', String(total));
  res.json(rows.map(shape));
}));

/* CREATE — tolerant to bad customerId: falls back to customerName/customer.name */
r.post('/', asyncHandler(async (req, res) => {
  const TENANT = req.tenantId;

  let { customerId, customer, customerName, invoiceNo, invoiceDate, lines = [], tax = 0, status } = req.body || {};

  // Prefer explicit id; else get from customer object; else from customerName
  if (!customerId) customerId = customer?._id || customer?.id || null;

  // If the id is present but invalid → ignore it and try to resolve by name
  if (customerId && !mongoose.Types.ObjectId.isValid(customerId)) {
    customerId = null;
    if (!customerName) customerName = customer?.name; // fallback from object
  }

  // If still no id, resolve/create by name
  if (!customerId) {
    const name = (customerName || '').toString().trim();
    if (!name) return res.status(422).json({ error: 'customerId invalid and no customerName provided' });
    const ex = await Customer.findOne({ tenantId: TENANT, name }).lean();
    customerId = ex ? ex._id.toString() : (await Customer.create({ tenantId: TENANT, name }))._id.toString();
  }

  // ensure the (resolved) customer belongs to tenant
  const own = await Customer.exists({ _id: customerId, tenantId: TENANT });
  if (!own) return res.status(400).json({ error: 'Invalid customer for tenant' });

  // Dates & invoice no
  const invDate = normDate(invoiceDate) || normDate(new Date());
  if (!invDate) return res.status(422).json({ error: 'invoiceDate invalid' });
  if (!invoiceNo || String(invoiceNo).trim() === '') invoiceNo = autoNo();

  // Lines & totals
  const computed = Array.isArray(lines) ? lines.map(l => {
    const qty = Number(l?.qty ?? 0), rate = Number(l?.rate ?? 0);
    return { description: String(l?.description ?? ''), qty: Number.isFinite(qty)?qty:0, rate: Number.isFinite(rate)?rate:0, amount: (Number.isFinite(qty)?qty:0)*(Number.isFinite(rate)?rate:0) };
  }) : [];
  const subtotal = computed.reduce((s,x)=>s+(Number.isFinite(x.amount)?x.amount:0),0);
  const taxNum = Number(tax ?? 0);
  const total = subtotal + (Number.isFinite(taxNum)?taxNum:0);

  // createdBy (optional)
  const headerUserId = req.headers['x-user-id'];
  const createdByPatch = (headerUserId && mongoose.Types.ObjectId.isValid(headerUserId)) ? { createdBy: headerUserId } : {};

  const created = await Invoice.create({
    tenantId: TENANT,
    customerId,
    invoiceNo: String(invoiceNo),
    invoiceDate: invDate,
    lines: computed,
    subtotal,
    tax: Number.isFinite(taxNum) ? taxNum : 0,
    total,
    status: normStatus(status) || 'draft',
    ...createdByPatch,
  });

  const populated = await Invoice.findById(created._id)
    .populate({ path: 'customerId', select: 'name email phone' })
    .lean();

  res.status(201).json(shape(populated));
}));

/* READ */
r.get('/:id', asyncHandler(async (req, res) => {
  const TENANT = req.tenantId;
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  const doc = await Invoice.findOne({ _id: id, tenantId: TENANT })
    .populate({ path: 'customerId', select: 'name email phone' }).lean();
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json(shape(doc));
}));

/* UPDATE */
async function updateInvoice(req, res) {
  const TENANT = req.tenantId;
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

  const update = { ...(req.body || {}) };

  if ('status' in update) {
    const s = normStatus(update.status);
    if (!s) return res.status(422).json({ error: 'status invalid' });
    update.status = s;
  }
  if ('invoiceDate' in update) {
    const nd = normDate(update.invoiceDate);
    if (!nd) return res.status(422).json({ error: 'invoiceDate invalid' });
    update.invoiceDate = nd;
  }
  if (Array.isArray(update.lines)) {
    const computed = update.lines.map(l => {
      const qty = Number(l?.qty ?? 0), rate = Number(l?.rate ?? 0);
      return { description: String(l?.description ?? ''), qty: Number.isFinite(qty)?qty:0, rate: Number.isFinite(rate)?rate:0, amount: (Number.isFinite(qty)?qty:0)*(Number.isFinite(rate)?rate:0) };
    });
    const subtotal = computed.reduce((s,x)=>s+(Number.isFinite(x.amount)?x.amount:0),0);
    const taxNum = Number(update.tax ?? 0);
    update.lines = computed;
    update.subtotal = subtotal;
    update.tax = Number.isFinite(taxNum)?taxNum:0;
    update.total = subtotal + (Number.isFinite(taxNum)?taxNum:0);
  }

  await Invoice.updateOne({ _id: id, tenantId: TENANT }, { $set: update });
  const after = await Invoice.findOne({ _id: id, tenantId: TENANT })
    .populate({ path: 'customerId', select: 'name email phone' }).lean();
  if (!after) return res.status(404).json({ error: 'Not found' });
  res.json(shape(after));
}
r.patch('/:id', asyncHandler(updateInvoice));
r.put('/:id',   asyncHandler(updateInvoice));

/* DELETE */
r.delete('/:id', asyncHandler(async (req, res) => {
  const TENANT = req.tenantId;
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  const ok = await Invoice.deleteOne({ _id: id, tenantId: TENANT });
  if (ok.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
}));

export default r;
