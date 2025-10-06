import express from 'express'
import Customer from '../models/Customer.js'

const router = express.Router()

// ---------- LIST ----------
router.get('/', async (req, res, next) => {
  try {
    const { q = '', limit = 500, offset = 0 } = req.query
    const query = req.scoped({}) // tenant scoping comes from middleware

    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      Object.assign(query, { $or: [
        { name:   rx },
        { email:  rx },
        { phone:  rx },
        { code:   rx },
      ]})
    }

    const docs = await Customer.find(query)
      .sort({ createdAt: -1 })
      .skip(Number(offset) || 0)
      .limit(Math.min(Number(limit) || 500, 1000))
      .lean()

    res.set('x-total-count', String(docs.length))
    res.json(docs.map(({ _id, ...rest }) => ({ id: String(_id), ...rest })))
  } catch (err) { next(err) }
})

// helper: generate a code if none provided (simple, tenant-safe enough for demo)
function genCode() {
  const d = new Date()
  const ym = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}`
  const rnd = Math.floor(1000 + Math.random()*9000)
  return `CUS-${ym}-${rnd}`
}

// ---------- CREATE (idempotent) ----------
router.post('/', async (req, res, next) => {
  try {
    const body   = req.body || {}
    const name   = (body.name || '').trim()
    const email  = (body.email || '').trim().toLowerCase() || undefined
    const phone  = (body.phone || '').trim() || undefined
    const address= (body.address || '').trim() || undefined
    const codeIn = (body.code || body.id || '').trim() || undefined // accept old "id", map to "code"

    if (!name) return res.status(400).json({ error: 'Name required' })

    // Find an existing customer in this tenant by email OR code OR exact name
    const existing = await Customer.findOne(req.scoped({
      $or: [
        ...(email ? [{ email }] : []),
        ...(codeIn ? [{ code: codeIn }] : []),
        { name: { $regex: `^${name}$`, $options: 'i' } },
      ]
    }))

    if (existing) {
      // Idempotent success: return the existing row with created:false
      const { _id, ...rest } = existing.toObject()
      return res.status(200).json({ created: false, id: String(_id), ...rest })
    }

    // Create new doc (generate code if not provided)
    const doc = await Customer.create({
      tenantId: req.tenantId,
      name,
      email,
      phone,
      address,
      code: codeIn || genCode(),
      createdBy: req.userId || null,
    })

    const { _id, ...rest } = doc.toObject()
    res.status(201).json({ created: true, id: String(_id), ...rest })
  } catch (err) {
    // Handle unique index races gracefully — return existing (idempotent)
    if (err?.code === 11000) {
      const email = (req.body?.email || '').toLowerCase()
      const code  = (req.body?.code || req.body?.id || '')
      const byUnique = await Customer.findOne(req.scoped({
        $or: [
          ...(email ? [{ email }] : []),
          ...(code  ? [{ code }]  : []),
          { name: { $regex: `^${(req.body?.name||'').trim()}$`, $options: 'i' } },
        ]
      }))
      if (byUnique) {
        const { _id, ...rest } = byUnique.toObject()
        return res.status(200).json({ created: false, id: String(_id), ...rest })
      }
    }
    next(err)
  }
})

export default router
