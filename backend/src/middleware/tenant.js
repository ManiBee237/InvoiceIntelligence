// src/middleware/tenant.js
import mongoose from 'mongoose'
import Tenant from '../models/Tenant.js' // make sure this exists

const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v || ''))

/**
 * Usage in routes:
 *   router.get('/', withTenant, async (req, res) => {
 *     const docs = await Model.find(req.scoped({ status: 'Open' }))
 *     res.json(docs)
 *   })
 *
 * What it sets:
 *   req.tenantId -> string ObjectId
 *   req.scoped(baseQuery) -> merges { tenantId } into baseQuery
 * 
 */

export { withTenant as tenantMiddleware };
export default withTenant;

export async function withTenant(req, res, next) {
  try {
    // 1) Try header first
    let tid = req.get('x-tenant-id') || req.headers['x-tenant-id']

    // 2) Then token/user (if your auth middleware sets req.user)
    if (!tid && req.user?.tenantId) tid = req.user.tenantId

    // 3) Then query param fallback (?tenant=slugOrId)
    if (!tid && req.query?.tenant) tid = req.query.tenant

    if (!tid) {
      return res.status(400).json({ error: 'Missing x-tenant-id' })
    }

    // Resolve slug/name -> _id if needed
    let tenantId = null
    if (isObjectId(tid)) {
      tenantId = String(tid)
    } else {
      const t = await Tenant.findOne(
        { $or: [{ slug: tid }, { name: tid }] },
        { _id: 1 }
      ).lean()
      if (t) tenantId = String(t._id)
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'Invalid tenant (not found)' })
    }

    req.tenantId = tenantId
    // Helper to always scope queries to this tenant
    req.scoped = (base = {}) => ({
      ...base,
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })

    next()
  } catch (err) {
    console.error('[withTenant] resolve error:', err)
    res.status(500).json({ error: 'Tenant resolution failed' })
  }
}
