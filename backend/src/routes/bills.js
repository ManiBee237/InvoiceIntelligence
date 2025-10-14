// src/routes/bills.js
import { Router } from 'express';
import mongoose from 'mongoose';
import Bill from '../models/Bill.js';
import Vendor from '../models/Vendor.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const r = Router();

/* ----------------------------- helpers ----------------------------- */
const isId = (s) => typeof s === 'string' && /^[a-f\d]{24}$/i.test(s);
const normDate = (d) => {
  if (!d) return null;
  const t = d instanceof Date ? d : new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0,10);
};
const autoNo = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const r = Math.floor(Math.random()*9000)+1000;
  return `BILL-${y}${m}-${r}`;
};
const STAT = new Set(['draft','open','approved','paid','void']);
const MAP  = new Map([
  ['pending','open'], ['unpaid','open'], ['issued','open'],
  ['completed','paid'], ['settled','paid'],
  ['cancelled','void'], ['canceled','void'], ['voided','void']
]);
const normStatus = (s) => {
  if (s == null) return null;
  const v = String(s).trim().toLowerCase();
  const m = MAP.get(v) || v;
  return STAT.has(m) ? m : null;
};

const shape = (x) => {
  const id = x.id || x._id?.toString?.();
  const vendorId = typeof x.vendorId === 'object' ? x.vendorId?._id?.toString?.() : x.vendorId;
  const vendorName = typeof x.vendorId === 'object' ? x.vendorId?.name : (x.vendorName || null);
  const billDate = x.billDate instanceof Date ? x.billDate.toISOString().slice(0,10) : x.billDate;
  const dueDate  = x.dueDate  instanceof Date ? x.dueDate.toISOString().slice(0,10) : x.dueDate;
  return {
    id,
    tenantId: x.tenantId,
    vendorId,
    vendorName,
    billNo: x.billNo,
    billDate,
    dueDate,
    lines: x.lines || [],
    subtotal: Number(x.subtotal || 0),
    tax: Number(x.tax || 0),
    total: Number(x.total || 0),
    status: x.status,
    createdAt: x.createdAt,
    updatedAt: x.updatedAt,
  };
};

/* ------------------------------- LIST ------------------------------- */
/** GET /api/bills?search=&status=&page=&limit= */
r.get('/', asyncHandler(async (req, res) => {
  const TENANT = req.tenantId;
  const { search = '', status, page = 1, limit = 20 } = req.query;

  const p = Math.max(1, parseInt(page,10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit,10) || 20));

  const q = { tenantId: TENANT };
  const s = status ? normStatus(status) : null;
  if (status && !s) return res.status(422).json({ error: 'status invalid' });
  if (s) q.status = s;

  if (search && String(search).trim()) {
    const rx = new RegExp(String(search).trim(), 'i');
    q.$or = [{ billNo: rx }]; // vendorName filter will be post-processed
  }

  const [rows, total] = await Promise.all([
    Bill.find(q)
      .populate({ path: 'vendorId', select: 'name email phone' })
      .sort({ createdAt: -1 })
      .skip((p-1)*l).limit(l).lean(),
    Bill.countDocuments(q),
  ]);

  let list = rows.map(shape);
  if (search && String(search).trim()) {
    const rx = new RegExp(String(search).trim(), 'i');
    list = list.filter(b => rx.test(b.vendorName || '') || rx.test(b.billNo || ''));
  }

  res.setHeader('x-total-count', String(total));
  res.json(list);
}));

/* ------------------------------ CREATE ------------------------------ */
/**
 * POST /api/bills
 * Accepts vendor in ANY of these shapes:
 *  - { vendorId: "<24-hex>" }
 *  - { vendorName: "Acme" }
 *  - { vendor: "<24-hex>" } OR { vendor: "Acme" }
 *  - { vendor: { _id: "<24-hex>", name: "Acme" } }
 */
r.post('/', asyncHandler(async (req, res) => {
  const TENANT = req.tenantId;
  let { vendorId, vendorName, vendor, billNo, billDate, dueDate, lines = [], tax = 0, status } = req.body || {};

  // normalize vendor fields
  const raw = vendor ?? vendorId ?? vendorName;
  if (!vendorId && raw) {
    if (typeof raw === 'string') {
      if (isId(raw)) vendorId = raw; else vendorName = raw;
    } else if (typeof raw === 'object') {
      vendorId = raw._id || raw.id || vendorId;
      vendorName = raw.name || vendorName;
    }
  }
  if (!vendorName && req.body?.vendorName) vendorName = String(req.body.vendorName).trim();

  // resolve/create vendor
  if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId)) {
    const name = String(vendorName || '').trim();
    if (!name) return res.status(422).json({ error: 'vendorId invalid and no vendorName provided' });
    const ex = await Vendor.findOne({ tenantId: TENANT, name }).lean();
    vendorId = ex ? ex._id.toString() : (await Vendor.create({ tenantId: TENANT, name }))._id.toString();
  }
  const own = await Vendor.exists({ _id: vendorId, tenantId: TENANT });
  if (!own) return res.status(400).json({ error: 'Invalid vendor for tenant' });

  // dates
  const bDate = normDate(billDate) || normDate(new Date());
  if (!bDate) return res.status(422).json({ error: 'billDate invalid' });
  const dDate = dueDate ? normDate(dueDate) : undefined;

  // billNo auto
  if (!billNo || String(billNo).trim() === '') billNo = autoNo();

  // lines & totals
  const computed = Array.isArray(lines) ? lines.map(l => {
    const qty  = Number(l?.qty ?? 0);
    const rate = Number(l?.rate ?? 0);
    const amount = (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(rate) ? rate : 0);
    return {
      description: String(l?.description ?? ''),
      qty: Number.isFinite(qty) ? qty : 0,
      rate: Number.isFinite(rate) ? rate : 0,
      amount
    };
  }) : [];
  const subtotal = computed.reduce((s,x)=>s+(Number.isFinite(x.amount)?x.amount:0),0);
  const taxNum   = Number(tax ?? 0);
  const total    = subtotal + (Number.isFinite(taxNum)?taxNum:0);

  // createdBy from header (optional)
  const headerUserId = req.headers['x-user-id'];
  const createdByPatch = (headerUserId && mongoose.Types.ObjectId.isValid(headerUserId)) ? { createdBy: headerUserId } : {};

  const created = await Bill.create({
    tenantId: TENANT,
    vendorId,
    billNo: String(billNo),
    billDate: bDate,
    dueDate: dDate,
    lines: computed,
    subtotal,
    tax: Number.isFinite(taxNum)?taxNum:0,
    total,
    status: normStatus(status) || 'open',
    ...createdByPatch,
  });

  const populated = await Bill.findById(created._id)
    .populate({ path: 'vendorId', select: 'name email phone' })
    .lean();

  res.status(201).json(shape(populated));
}));

/* ------------------------------- READ ------------------------------- */
r.get('/:id', asyncHandler(async (req, res) => {
  const TENANT = req.tenantId;
  const { id } = req.params;
  if (!isId(id)) return res.status(400).json({ error: 'Invalid id' });

  const doc = await Bill.findOne({ _id: id, tenantId: TENANT })
    .populate({ path: 'vendorId', select: 'name email phone' })
    .lean();
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json(shape(doc));
}));

/* ------------------------------ UPDATE ------------------------------ */
async function doUpdate(req, res) {
  const TENANT = req.tenantId;
  const { id } = req.params;
  if (!isId(id)) return res.status(400).json({ error: 'Invalid id' });

  const update = { ...(req.body || {}) };

  // status: coerce or ignore invalid (no 422)
  if ('status' in update) {
    const s = normStatus(update.status);
    if (s) update.status = s;
    else delete update.status;
  }

  // dates
  if ('billDate' in update) {
    const nd = normDate(update.billDate);
    if (!nd) return res.status(422).json({ error: 'billDate invalid' });
    update.billDate = nd;
  }
  if ('dueDate' in update) {
    if (update.dueDate) {
      const dd = normDate(update.dueDate);
      if (!dd) return res.status(422).json({ error: 'dueDate invalid' });
      update.dueDate = dd;
    } else {
      update.dueDate = undefined;
    }
  }

  // lines & totals
  if (Array.isArray(update.lines)) {
    const computed = update.lines.map(l => {
      const qty  = Number(l?.qty ?? 0);
      const rate = Number(l?.rate ?? 0);
      const amount = (Number.isFinite(qty)?qty:0)*(Number.isFinite(rate)?rate:0);
      return {
        description: String(l?.description ?? ''),
        qty: Number.isFinite(qty)?qty:0,
        rate: Number.isFinite(rate)?rate:0,
        amount
      };
    });
    const subtotal = computed.reduce((s,x)=>s+(Number.isFinite(x.amount)?x.amount:0),0);
    const taxNum = Number(update.tax ?? 0);
    update.lines = computed;
    update.subtotal = subtotal;
    update.tax = Number.isFinite(taxNum)?taxNum:0;
    update.total = subtotal + (Number.isFinite(taxNum)?taxNum:0);
  }

  // optional vendor change by id/name/object
  if ('vendorId' in update || 'vendorName' in update || update.vendor) {
    let { vendorId, vendorName, vendor } = update;
    const raw = vendor ?? vendorId ?? vendorName;
    if (!vendorId && raw) {
      if (typeof raw === 'string') {
        if (isId(raw)) vendorId = raw; else vendorName = raw;
      } else if (typeof raw === 'object') {
        vendorId = raw._id || raw.id || vendorId;
        vendorName = raw.name || vendorName;
      }
    }
    if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId)) {
      const name = String(vendorName || '').trim();
      if (!name) return res.status(422).json({ error: 'vendorId invalid and no vendorName provided' });
      const ex = await Vendor.findOne({ tenantId: TENANT, name }).lean();
      vendorId = ex ? ex._id.toString() : (await Vendor.create({ tenantId: TENANT, name }))._id.toString();
    }
    const own = await Vendor.exists({ _id: vendorId, tenantId: TENANT });
    if (!own) return res.status(400).json({ error: 'Invalid vendor for tenant' });
    update.vendorId = vendorId;
    delete update.vendor; delete update.vendorName;
  }

  await Bill.updateOne({ _id: id, tenantId: TENANT }, { $set: update });

  const after = await Bill.findOne({ _id: id, tenantId: TENANT })
    .populate({ path: 'vendorId', select: 'name email phone' })
    .lean();
  if (!after) return res.status(404).json({ error: 'Not found' });

  res.json(shape(after));
}
r.patch('/:id', asyncHandler(doUpdate));
r.put('/:id',   asyncHandler(doUpdate));

/* ------------------------------ DELETE ------------------------------ */
r.delete('/:id', asyncHandler(async (req, res) => {
  const TENANT = req.tenantId;
  const { id } = req.params;
  if (!isId(id)) return res.status(400).json({ error: 'Invalid id' });
  const ok = await Bill.deleteOne({ _id: id, tenantId: TENANT });
  if (ok.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
}));

export default r;
