// src/middleware/auth.js
import mongoose from 'mongoose'

export function devAuth(req, res, next) {
  let t = req.header('x-tenant-id')
  let u = req.header('x-user-id')

  // ⬇️ DEV-ONLY fallback so local requests don't fail
  if (!t && process.env.NODE_ENV !== 'production') {
    t = '66f000000000000000000001'
    u = u || '66f000000000000000000002'
  }

  if (!t) return res.status(401).json({ error: 'Missing x-tenant-id' })

  req.user = {
    tenantId: new mongoose.Types.ObjectId(t),
    userId: u ? new mongoose.Types.ObjectId(u) : null,
    roles: ['owner']
  }
  next()
}
