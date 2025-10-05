import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import Tenant from '../models/Tenant.js'
import User from '../models/User.js'

const router = express.Router()
const slugify = s => String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { tenant, tenantName, email, password, name } = req.body || {}
    if (!tenant && !tenantName) return res.status(400).json({ error: 'tenant or tenantName required' })
    if (!email || !password)   return res.status(400).json({ error: 'email and password required' })

    const slug = tenant ? slugify(tenant) : slugify(tenantName)
    let ten = await Tenant.findOne({ slug })
    if (!ten) ten = await Tenant.create({ name: tenantName || slug, slug })

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await User.create({
      tenantId: ten._id,
      email: String(email).toLowerCase(),
      name: name || email.split('@')[0],
      passwordHash,
      roles: ['owner'],
    })

    res.json({ user, tenantId: ten._id, tenantSlug: ten.slug })
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: 'User already exists for this tenant' })
    console.error('[auth/register]', err)
    res.status(500).json({ error: 'Internal Error' })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password, tenant } = req.body || {}
    if (!email || !password) return res.status(400).json({ error: 'email and password required' })

    let ten
    if (tenant) {
      ten = await Tenant.findOne({ slug: slugify(tenant) })
      if (!ten) return res.status(404).json({ error: 'Tenant not found' })
    } else if (req.headers['x-tenant-id']) {
      ten = await Tenant.findById(req.headers['x-tenant-id'])
      if (!ten) return res.status(404).json({ error: 'Tenant not found' })
    } else {
      // demo auto-provision
      ten = await Tenant.findOne({ slug: 'demo' })
      if (!ten) ten = await Tenant.create({ name: 'Demo', slug: 'demo' })
    }

    let user = await User.findOne({ tenantId: ten._id, email: String(email).toLowerCase() })
    if (!user) {
      // allow auto-provision in demo only
      if (ten.slug === 'demo') {
        const passwordHash = await bcrypt.hash(password, 10)
        user = await User.create({
          tenantId: ten._id,
          email: String(email).toLowerCase(),
          name: 'Demo User',
          passwordHash,
          roles: ['admin'],
        })
      } else {
        return res.status(401).json({ error: 'Invalid credentials' })
      }
    }

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })

    user.lastLoginAt = new Date()
    await user.save()

    const token = process.env.JWT_SECRET
      ? jwt.sign({ sub: String(user._id), t: String(ten._id) }, process.env.JWT_SECRET, { expiresIn: '7d' })
      : null

    res.json({ user, tenantId: ten._id, tenantSlug: ten.slug, token })
  } catch (err) {
    console.error('[auth/login]', err)
    res.status(500).json({ error: 'Internal Error' })
  }
})

// GET /api/auth/me (expects headers set by frontend)
router.get('/me', async (req, res) => {
  try {
    const userId = req.headers['x-user-id']
    const tenantId = req.headers['x-tenant-id']
    if (!userId || !tenantId) return res.status(400).json({ error: 'Missing headers' })
    const user = await User.findOne({ _id: userId, tenantId })
    if (!user) return res.status(404).json({ error: 'Not found' })
    const t = await Tenant.findById(tenantId).lean()
    res.json({ user, tenantId, tenantSlug: t?.slug })
  } catch (err) {
    console.error('[auth/me]', err)
    res.status(500).json({ error: 'Internal Error' })
  }
})

export default router
