// backend/src/routes/invoices.js
import express from 'express'
import mongoose from 'mongoose'
import Invoice from '../models/Invoice.js'
import Customer from '../models/Customer.js'
import Counter from '../models/Counter.js'
import { withTenant } from '../middleware/tenant.js'

const router = express.Router()
const isOid = (s) => typeof s === 'string' && mongoose.Types.ObjectId.isValid(s)

/* ------------------------------- helpers -------------------------------- */
function parseDate(s) {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}
function toNum(v, def = 0) {
  if (v === null || v === undefined || v === '') return def
  const n = Number(String(v).replace(/[, ]/g, ''))
  return Number.isFinite(n) ? n : NaN
}
async function nextInvoiceNumber(tenantId) {
  const yyyymm = new Date().toISOString().slice(0,7).replace('-', '')
  const key = `INV-${yyyymm}`
  const doc = await Counter.findOneAndUpdate(
    { tenantId, key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )
  const seq = String(doc.seq).padStart(4, '0')
  return `${key}-${seq}`
}

// Find or create a customer from ANY of: objectId, code/id string, name, email
async function resolveCustomer({ tenantId, rawId, name, email, req }) {
  const trimmedRaw = (rawId ?? '').toString().trim()
  const trimmedName = (name ?? '').toString().trim()
  const trimmedEmail = (email ?? '').toString().trim()

  // 1) If raw looks like an ObjectId, fetch by _id
  if (isOid(trimmedRaw)) {
    const found = await Customer.findOne(req.scoped({ _id: trimmedRaw }), { _id: 1, name: 1, email: 1 })
    if (found) return { customerId: found._id, customerName: found.name, customerEmail: trimmedEmail || found.email }
  }

  // 2) Try by code/id/name/email (string refs your UI might pass)
  if (trimmedRaw || trimmedName || trimmedEmail) {
    const found2 = await Customer.findOne(req.scoped({
      $or: [
        { id: trimmedRaw },       // e.g. "CUS-202510-9305"
        { code: trimmedRaw },
        { name: trimmedRaw || trimmedName },
        { email: trimmedRaw || trimmedEmail }
      ]
    }))
    if (found2) return { customerId: found2._id, customerName: found2.name, customerEmail: trimmedEmail || found2.email }
  }

  // 3) Create if we have *some* identity
  const finalName = trimmedName || trimmedRaw || trimmedEmail
  if (finalName || trimmedEmail) {
    const created = await Customer.create({ tenantId, name: finalName, email: trimmedEmail || undefined })
    return { customerId: created._id, customerName: created.name, customerEmail: created.email }
  }

  // 4) Nothing to resolve
  return { customerId: null, customerName: null, customerEmail: trimmedEmail || undefined }
}

/* --------------------------------- routes -------------------------------- */

// CREATE
router.post('/', withTenant, async (req, res) => {
  try {
    const tenantId = req.tenantId
    const b = req.body || {}

    // Accept many aliases; if customerId is NOT an ObjectId, treat it as a code/name/email
    const rawCustomerId = b.customerId ?? b.customerID ?? b.customer_id
    const customerNameIn = b.customerName ?? b.customer ?? b.customer_name ?? b.name
    const customerEmailIn = b.customerEmail ?? b.email

    const { customerId, customerName, customerEmail } = await resolveCustomer({
      tenantId,
      rawId: rawCustomerId,
      name: customerNameIn,
      email: customerEmailIn,
      req
    })

    if (!customerId && !customerName) {
      return res.status(400).json({ error: 'customerId or customerName is required' })
    }

    // Items normalization (tolerate aliases)
    const itemsIn = Array.isArray(b.items) ? b.items : []
    if (itemsIn.length === 0) {
      return res.status(400).json({ error: 'At least 1 line item required' })
    }

    const normItems = itemsIn.map((it, idx) => {
      const qty = toNum(it.qty ?? it.quantity ?? 1, 1)
      const unitPrice = toNum(it.unitPrice ?? it.rate ?? it.price ?? it.amount ?? 0, 0)
      const gst = toNum(it.gst ?? it.gstPct ?? it.tax ?? 0, 0)
      if (!Number.isFinite(qty) || qty < 0) throw new Error(`Invalid qty at row ${idx + 1}`)
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error(`Invalid unit price at row ${idx + 1}`)
      if (!Number.isFinite(gst) || gst < 0) throw new Error(`Invalid GST at row ${idx + 1}`)
      return { description: it.description ?? it.desc ?? '', qty, unitPrice, gst }
    })

    // Dates (fallback Net 30)
    const date = parseDate(b.date) || new Date()
    let dueDate = parseDate(b.dueDate ?? b.due)
    if (!dueDate) { const tmp = new Date(date); tmp.setDate(tmp.getDate() + 30); dueDate = tmp }

    // Totals
    const subTotal = normItems.reduce((a, it) => a + it.qty * it.unitPrice, 0)
    const taxTotal = normItems.reduce((a, it) => a + (it.gst > 0 ? it.qty * it.unitPrice * (it.gst / 100) : 0), 0)
    const total = Math.round((subTotal + taxTotal) * 100) / 100

    // Numbering (unique per tenant)
    let number = (b.number || '').toString().trim()
    if (!number) number = await nextInvoiceNumber(tenantId)
    const dup = await Invoice.findOne(req.scoped({ number }), { _id: 1 })
    if (dup) return res.status(409).json({ error: 'Duplicate invoice number', number })

    // Build safe payload (only include customerId if it's an ObjectId)
    const payload = {
      tenantId,
      number,
      customerName,
      customerEmail,
      date,
      dueDate,
      items: normItems,
      subTotal,
      taxTotal,
      total,
      balance: total,
      status: b.status || 'Open',
      notes: b.notes || ''
    }
    if (customerId) payload.customerId = customerId

    const doc = await Invoice.create(payload)
    return res.status(201).json(doc)
  } catch (e) {
    console.error('[invoices:create]', e)
    return res.status(400).json({ error: e.message || 'Failed to create invoice' })
  }
})

// LIST (status & limit supported)
router.get('/', withTenant, async (req, res) => {
  try {
    const { status = 'All', limit = 500 } = req.query
    const q = status === 'All' ? {} : { status }
    const rows = await Invoice.find(req.scoped(q))
      .sort({ date: -1 })
      .limit(Math.min(Number(limit) || 500, 2000))
      .lean()
    res.json(rows)
  } catch (e) {
    console.error('[invoices:list]', e)
    res.status(500).json({ error: 'Failed to fetch invoices' })
  }
})

export default router
