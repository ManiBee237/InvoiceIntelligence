import express from 'express'
import Invoice from '../models/Invoice.js'
import Bill from '../models/Bill.js'
import { withTenant } from '../middleware/tenant.js'

const router = express.Router()

function bucketize(items, dateField, amountField) {
  const today = new Date()
  const b = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
  for (const it of items) {
    const due = new Date(it[dateField])
    const amt = Number(it[amountField] ?? it.total ?? 0)
    const days = Math.floor((today - due) / (1000*60*60*24))
    if (days <= 0) continue
    if (days <= 30) b['0-30'] += amt
    else if (days <= 60) b['31-60'] += amt
    else if (days <= 90) b['61-90'] += amt
    else b['90+'] += amt
  }
  return b
}

router.get('/aging/ar', withTenant, async (req, res) => {
  const docs = await Invoice.find(req.scoped({ status: { $in: ['Open','Overdue'] } }), { dueDate: 1, balance: 1, total: 1 })
  const buckets = bucketize(docs, 'dueDate', 'balance')
  res.json(buckets)
})

router.get('/aging/ap', withTenant, async (req, res) => {
  const docs = await Bill.find(req.scoped({ status: { $in: ['Open','Overdue'] } }), { due: 1, balance: 1, total: 1 })
  const buckets = bucketize(docs, 'due', 'balance')
  res.json(buckets)
})

export default router
