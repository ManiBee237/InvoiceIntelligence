// src/routes/dashboard.js
import express from 'express';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Bill from '../models/Bill.js';

const router = express.Router();

// GET /api/dashboard?days=30
router.get('/', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const days = Math.max(1, Math.min(90, Number(req.query.days) || 30));
    const today = new Date();
    const since = new Date(today);
    since.setDate(since.getDate() - days + 1);

    // --- Cards ---
    const [invAll, invOpenOverdue, invPaid, apOpen, apOverdue, apPaid] = await Promise.all([
      // total invoiced (all time)
      Invoice.aggregate([
        { $match: { tenantId, isDeleted: { $ne: true } } },
        { $group: { _id: null, amount: { $sum: '$total' } } },
      ]),
      // outstanding = Open + Overdue
      Invoice.aggregate([
        { $match: { tenantId, isDeleted: { $ne: true }, status: { $in: ['Open', 'Overdue'] } } },
        { $group: { _id: null, amount: { $sum: '$total' } } },
      ]),
      // paid (for collections rate, optional)
      Invoice.aggregate([
        { $match: { tenantId, isDeleted: { $ne: true }, status: 'Paid' } },
        { $group: { _id: null, amount: { $sum: '$total' } } },
      ]),
      // AP snapshots
      Bill.aggregate([
        { $match: { tenantId, isDeleted: { $ne: true }, status: 'Open' } },
        { $group: { _id: null, amount: { $sum: '$amount' } } },
      ]),
      Bill.aggregate([
        { $match: { tenantId, isDeleted: { $ne: true }, status: 'Overdue' } },
        { $group: { _id: null, amount: { $sum: '$amount' } } },
      ]),
      Bill.aggregate([
        { $match: { tenantId, isDeleted: { $ne: true }, status: 'Paid' } },
        { $group: { _id: null, amount: { $sum: '$amount' } } },
      ]),
    ]);

    // cash-in (payments in range)
    const payInRange = await Payment.aggregate([
      { $match: { tenantId, isDeleted: { $ne: true }, date: { $gte: since, $lte: today } } },
      { $group: { _id: null, amount: { $sum: '$amount' } } },
    ]);

    const cards = {
      totalInvoiced: invAll[0]?.amount || 0,
      totalOutstanding: invOpenOverdue[0]?.amount || 0,
      paidAmount: invPaid[0]?.amount || 0,
      apOpen: apOpen[0]?.amount || 0,
      apOverdue: apOverdue[0]?.amount || 0,
      apPaid: apPaid[0]?.amount || 0,
      cashIn: payInRange[0]?.amount || 0,
    };

    // --- Charts (last N days) ---
    const [invoicedByDay, paymentsByDay, billsByDay] = await Promise.all([
      Invoice.aggregate([
        { $match: { tenantId, isDeleted: { $ne: true }, date: { $gte: since, $lte: today } } },
        { $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            amount: { $sum: '$total' },
            count: { $sum: 1 },
          } },
        { $sort: { _id: 1 } },
      ]),
      Payment.aggregate([
        { $match: { tenantId, isDeleted: { $ne: true }, date: { $gte: since, $lte: today } } },
        { $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            amount: { $sum: '$amount' },
          } },
        { $sort: { _id: 1 } },
      ]),
      Bill.aggregate([
        { $match: { tenantId, isDeleted: { $ne: true }, date: { $gte: since, $lte: today } } },
        { $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            amount: { $sum: '$amount' },
            count: { $sum: 1 },
          } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // fill missing days with zeros to keep charts smooth
    const daysArr = Array.from({ length: days }, (_, k) => {
      const d = new Date(since); d.setDate(since.getDate() + k);
      return d.toISOString().slice(0, 10);
    });
    const indexBy = (arr) => Object.fromEntries(arr.map(r => [r._id, r]));
    const invIdx = indexBy(invoicedByDay);
    const payIdx = indexBy(paymentsByDay);
    const billIdx = indexBy(billsByDay);

    const charts = {
      invoicedByDay: daysArr.map(d => ({ date: d, amount: invIdx[d]?.amount || 0, count: invIdx[d]?.count || 0 })),
      paymentsByDay: daysArr.map(d => ({ date: d, amount: payIdx[d]?.amount || 0 })),
      billsByDay:    daysArr.map(d => ({ date: d, amount: billIdx[d]?.amount || 0, count: billIdx[d]?.count || 0 })),
    };

    // --- Top customers by total invoiced (all time, top 5) ---
    const topCustomers = await Invoice.aggregate([
      { $match: { tenantId, isDeleted: { $ne: true } } },
      { $group: { _id: '$customerName', total: { $sum: '$total' } } },
      { $sort: { total: -1 } },
      { $limit: 5 },
    ]);

    res.json({ ok: true, cards, charts, topCustomers });
  } catch (err) {
    console.error('[dashboard] error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

export default router;
