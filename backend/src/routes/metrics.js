import express from 'express'
import Invoice from '../models/Invoice.js'
import Payment from '../models/Payment.js'
import Bill from '../models/Bill.js'
import { withTenant } from '../middleware/tenant.js'

const router = express.Router()

router.get('/dashboard', withTenant, async (req, res) => {
  const { range = '30d' } = req.query
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30
  const to = new Date()
  const from = new Date(); from.setDate(from.getDate() - (days - 1))

  const [arOpen, arOverdue, apOpen, apOverdue, payments] = await Promise.all([
    Invoice.aggregate([{ $match: req.scoped({ status: 'Open' }) }, { $group: { _id: null, sum: { $sum: '$total' } } }]),
    Invoice.countDocuments(req.scoped({ status: 'Overdue' })),
    Bill.aggregate([{ $match: req.scoped({ status: 'Open' }) }, { $group: { _id: null, sum: { $sum: '$total' } } }]),
    Bill.countDocuments(req.scoped({ status: 'Overdue' })),
    Payment.aggregate([
      { $match: req.scoped({ date: { $gte: from.toISOString().slice(0,10), $lte: to.toISOString().slice(0,10) } }) },
      { $group: { _id: null, sum: { $sum: '$amount' } } }
    ])
  ])

  // collection rate
  const paidAgg = await Invoice.aggregate([{ $match: req.scoped({ status: 'Paid' }) }, { $group: { _id: null, sum: { $sum: '$total' } } }])
  const overdueAgg = await Invoice.aggregate([{ $match: req.scoped({ status: 'Overdue' }) }, { $group: { _id: null, sum: { $sum: '$total' } } }])
  const paid = paidAgg[0]?.sum || 0
  const openAmt = arOpen[0]?.sum || 0
  const overAmt = overdueAgg[0]?.sum || 0
  const collectible = paid + openAmt + overAmt
  const collectionRate = collectible ? (paid / collectible) * 100 : 0

  res.json({
    arOpenAmt: openAmt,
    arOverdueCnt: arOverdue,
    apOpenAmt: apOpen[0]?.sum || 0,
    apOverdueCnt: apOverdue,
    cashIn: payments[0]?.sum || 0,
    collectionRate
  })
})

export default router
