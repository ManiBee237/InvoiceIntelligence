// src/routes/dashboard.js
import express from 'express'
import Invoice from '../models/Invoice.js'
import Payment from '../models/Payment.js'
import Bill from '../models/Bill.js'

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const tenantId = req.tenantId || req.headers['x-tenant-id']
    if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id' })

    // time ranges
    const range = String(req.query.range || '30d')
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30
    const now = new Date()
    const today = new Date(now); today.setHours(0,0,0,0)
    const from = new Date(today); from.setDate(from.getDate() - (days - 1))

    const since14 = new Date(today); since14.setDate(since14.getDate() - 13)

    // helpers
    const to14DayArray = (buckets, type='count') => {
      const m = new Map(buckets.map(b => [b._id, type === 'sum' ? b.sum : b.count]))
      const arr = []
      for (let i = 0; i < 14; i++) {
        const d = new Date(since14); d.setDate(since14.getDate() + i)
        const k = d.toISOString().slice(0,10)
        arr.push(m.get(k) || 0)
      }
      return arr
    }

    const invFilter  = { tenantId }
    const payFilter  = { tenantId }
    const billFilter = { tenantId }

    // ---- cards (AR totals)
    const [invAll, invOpen, invOverdue, invPaid] = await Promise.all([
      Invoice.aggregate([
        { $match: invFilter },
        { $group: { _id: null, total: { $sum: { $toDouble: '$total' } } } }
      ]),
      Invoice.aggregate([
        { $match: { ...invFilter, status: 'Open' } },
        { $group: { _id: null, total: { $sum: { $toDouble: '$total' } } } }
      ]),
      Invoice.aggregate([
        { $match: { ...invFilter, status: 'Overdue' } },
        { $group: { _id: null, total: { $sum: { $toDouble: '$total' } } } }
      ]),
      Invoice.aggregate([
        { $match: { ...invFilter, status: 'Paid' } },
        { $group: { _id: null, total: { $sum: { $toDouble: '$total' } } } }
      ]),
    ])

    const cards = {
      totalInvoiced:     invAll[0]?.total || 0,
      totalOutstanding: (invOpen[0]?.total || 0) + (invOverdue[0]?.total || 0),
      arOpen:            invOpen[0]?.total || 0,
      arOverdue:         invOverdue[0]?.total || 0,
      arPaid:            invPaid[0]?.total || 0,
    }

    // ---- trends (last 14 days)
    const [invByDayAgg, payByDayAgg, billByDayAgg] = await Promise.all([
      Invoice.aggregate([
        { $match: { ...invFilter, date: { $gte: since14, $lte: now } } },
        { $group: { _id: { $dateToString: { date: '$date', format: '%Y-%m-%d' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Payment.aggregate([
        { $match: { ...payFilter, date: { $gte: since14, $lte: now } } },
        { $group: { _id: { $dateToString: { date: '$date', format: '%Y-%m-%d' } }, sum: { $sum: { $toDouble: '$amount' } } } },
        { $sort: { _id: 1 } },
      ]),
      Bill.aggregate([
        { $match: { ...billFilter, date: { $gte: since14, $lte: now } } },
        { $group: { _id: { $dateToString: { date: '$date', format: '%Y-%m-%d' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ])

    // ---- top customers (last 90d)
    const ninety = new Date(today); ninety.setDate(ninety.getDate() - 89)
    const topCustomers = await Invoice.aggregate([
      { $match: { ...invFilter, date: { $gte: ninety, $lte: now } } },
      { $group: { _id: '$customerName', total: { $sum: { $toDouble: '$total' } } } },
      { $sort: { total: -1 } },
      { $limit: 5 },
    ])

    // ---- recent payments (in selected range)
    const recentPayments = await Payment.find({ ...payFilter, date: { $gte: from, $lte: now } })
      .sort({ date: -1 }).limit(5).lean()

    // ---- upcoming bills (next 5)
    const upcomingBills = await Bill.find({
      ...billFilter,
      status: { $in: ['Open', 'Overdue'] },
      due: { $gte: today },
    }).sort({ due: 1 }).limit(5).lean()

    res.json({
      cards,
      charts: {
        invoicedByDay: to14DayArray(invByDayAgg, 'count'),
        paymentsByDay: to14DayArray(payByDayAgg, 'sum'),
        billsByDay:    to14DayArray(billByDayAgg, 'count'),
      },
      topCustomers,
      recentPayments,
      upcomingBills,
    })
  } catch (err) {
    console.error('[dashboard]', err)
    res.status(500).json({ error: err.message || 'Dashboard failed' })
  }
})

export default router
