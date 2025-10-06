// src/routes/reports.js
import express from 'express'
import Invoice from '../models/Invoice.js'
import Payment from '../models/Payment.js'
import Bill from '../models/Bill.js'

const router = express.Router()

const BUCKETS = ['0–30', '31–60', '61–90', '90+']
const ms = (d) => new Date(d)
const clipDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

router.get('/', async (req, res) => {
  try {
    const tenantId = req.tenantId || req.headers['x-tenant-id']
    if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id' })

    const today = clipDay(new Date())
    const from = req.query.from ? clipDay(ms(req.query.from)) : new Date(today.getFullYear(), today.getMonth(), 1)
    const to   = req.query.to   ? clipDay(ms(req.query.to))   : today

    /* ---------- Invoices in range ---------- */
    const invMatchRange = { tenantId, date: { $gte: from, $lte: to } }
    const invoices = await Invoice.find(invMatchRange)
      .select('number customerName date dueDate status total items')
      .lean()

    // Sum invoices (as numbers)
    const invTotalAmt = invoices.reduce((a, i) => a + (+i.total || 0), 0)
    const invCount = invoices.length
    const avgInvoice = invCount ? Math.round(invTotalAmt / invCount) : 0

    // GST collected: prefer items[] {qty, unitPrice, gstPct}
    let gstCollected = 0
    if (invoices.length) {
      const gstAgg = await Invoice.aggregate([
        { $match: invMatchRange },
        { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
        {
          $group: {
            _id: null,
            gst: {
              $sum: {
                $multiply: [
                  { $toDouble: { $ifNull: ['$items.unitPrice', 0] } },
                  { $toDouble: { $ifNull: ['$items.qty', 0] } },
                  { $divide: [{ $toDouble: { $ifNull: ['$items.gstPct', 0] } }, 100] }
                ]
              }
            }
          }
        }
      ])
      gstCollected = +(gstAgg?.[0]?.gst || 0)
    }

    /* ---------- Payments in range ---------- */
    const payments = await Payment.find({ tenantId, date: { $gte: from, $lte: to } })
      .sort({ date: -1 })
      .limit(10)
      .select('id date customer invoice method amount')
      .lean()
    const payAmt = payments.reduce((a, p) => a + (+p.amount || 0), 0)
    const payCount = payments.length

    /* ---------- Bills in range (for AP tile) ---------- */
    const billsInRange = await Bill.find({ tenantId, date: { $gte: from, $lte: to } })
      .select('status amount')
      .lean()
    const apOpenAmt    = billsInRange.filter(b => b.status === 'Open')
                                     .reduce((a, b) => a + (+b.amount || 0), 0)
    const apOverdueAmt = billsInRange.filter(b => b.status === 'Overdue')
                                     .reduce((a, b) => a + (+b.amount || 0), 0)

    /* ---------- AR Aging (all unpaid invoices, regardless of range) ---------- */
    const invAgingAgg = await Invoice.aggregate([
      { $match: { tenantId, status: { $ne: 'Paid' } } },
      {
        $project: {
          total: { $toDouble: { $ifNull: ['$total', 0] } },
          due: {
            $ifNull: [
              '$dueDate',
              { $ifNull: ['$due', { $add: ['$date', 1000 * 60 * 60 * 24 * 30] }] } // +30d fallback
            ]
          }
        }
      },
      {
        $addFields: {
          daysPastDue: {
            $dateDiff: { startDate: '$due', endDate: new Date(), unit: 'day' }
          }
        }
      },
      { $match: { daysPastDue: { $gt: 0 } } },
      {
        $project: {
          bucket: {
            $switch: {
              branches: [
                { case: { $lte: ['$daysPastDue', 30] }, then: '0–30' },
                { case: { $and: [{ $gt: ['$daysPastDue', 30] }, { $lte: ['$daysPastDue', 60] }] }, then: '31–60' },
                { case: { $and: [{ $gt: ['$daysPastDue', 60] }, { $lte: ['$daysPastDue', 90] }] }, then: '61–90' }
              ],
              default: '90+'
            }
          },
          total: 1
        }
      },
      { $group: { _id: '$bucket', amount: { $sum: '$total' } } }
    ])
    const arAgingMap = Object.fromEntries(BUCKETS.map(b => [b, 0]))
    invAgingAgg.forEach(x => { arAgingMap[x._id] = x.amount })
    const arAging = BUCKETS.map(b => ({ bucket: b, amount: arAgingMap[b] }))

    /* ---------- AP Aging (all unpaid bills) ---------- */
    const billAgingAgg = await Bill.aggregate([
      { $match: { tenantId, status: { $ne: 'Paid' } } },
      {
        $project: {
          amount: { $toDouble: { $ifNull: ['$amount', 0] } },
          due: { $ifNull: ['$due', { $add: ['$date', 1000 * 60 * 60 * 24 * 30] }] }
        }
      },
      {
        $addFields: {
          daysPastDue: {
            $dateDiff: { startDate: '$due', endDate: new Date(), unit: 'day' }
          }
        }
      },
      { $match: { daysPastDue: { $gt: 0 } } },
      {
        $project: {
          bucket: {
            $switch: {
              branches: [
                { case: { $lte: ['$daysPastDue', 30] }, then: '0–30' },
                { case: { $and: [{ $gt: ['$daysPastDue', 30] }, { $lte: ['$daysPastDue', 60] }] }, then: '31–60' },
                { case: { $and: [{ $gt: ['$daysPastDue', 60] }, { $lte: ['$daysPastDue', 90] }] }, then: '61–90' }
              ],
              default: '90+'
            }
          },
          amount: 1
        }
      },
      { $group: { _id: '$bucket', amount: { $sum: '$amount' } } }
    ])
    const apAgingMap = Object.fromEntries(BUCKETS.map(b => [b, 0]))
    billAgingAgg.forEach(x => { apAgingMap[x._id] = x.amount })
    const apAging = BUCKETS.map(b => ({ bucket: b, amount: apAgingMap[b] }))

    /* ---------- Top customers within range ---------- */
    const topCustomersAgg = await Invoice.aggregate([
      { $match: invMatchRange },
      { $group: { _id: '$customerName', total: { $sum: { $toDouble: '$total' } } } },
      { $sort: { total: -1 } },
      { $limit: 10 }
    ])
    const topCustomers = topCustomersAgg.map(x => ({ customer: x._id || '—', total: x.total || 0 }))

    res.json({
      summary: {
        invoices: { totalAmt: invTotalAmt, count: invCount, avg: avgInvoice, gstCollected },
        payments: { totalAmt: payAmt, count: payCount },
        ap: { openAmt: apOpenAmt, overdueAmt: apOverdueAmt }
      },
      arAging,
      apAging,
      invoices: invoices.map(i => ({
        number: i.number,
        customerName: i.customerName,
        date: i.date,
        dueDate: i.dueDate,
        status: i.status,
        total: +i.total || 0
      })),
      topCustomers,
      recentPayments: payments
    })
  } catch (err) {
    console.error('[reports]', err)
    res.status(500).json({ error: err.message || 'Reports failed' })
  }
})

export default router
