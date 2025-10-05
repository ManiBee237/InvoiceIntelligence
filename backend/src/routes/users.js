import express from 'express'
import User from '../models/User.js'

const router = express.Router()

// List users in this tenant
router.get('/', async (req, res) => {
  const users = await User.find({ tenantId: req.tenantId })
    .select('_id email name roles createdAt lastLoginAt isActive')
    .lean()
  res.json(users)
})

// Count users in this tenant
router.get('/count', async (req, res) => {
  const count = await User.countDocuments({ tenantId: req.tenantId })
  res.json({ count })
})

export default router
