// backend/src/routes/reports.js
import express from 'express';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Bill from '../models/Bill.js';

const router = express.Router();

const toDate = (s, def) => {
  const d = s ? new Date(s) : null;
  return isNaN(d?.getTime()) ? def : d;
};
const iso = (d) => new Date(d).toISOString().slice(0, 10);

function gstFromInvoice(inv) {
  if (typeof inv.gstAmount === 'number') return inv.gstAmount;

  // try first line item (your schema uses "lines")
  const it = Array.isArray(inv.lines) ? inv.lines[0] : Array.isArray(inv.items) ? inv.items[0] : null;
  if (it && (it.rate || it.unitPrice) && (it.gstPct || it.gst)) {
    const base = (Number(it.rate ?? it.unitPrice) || 0) * (Number(it.qty) || 0);
    const pct = Number(it.gstPct ?? it.gst ?? 0);
    return Math.round(base * (pct / 100));
  }

  // fallback: infer from total & gst/gstPct
  const gstPct = Number(inv.gst ?? inv.gstPct ?? 0);
  const total = Number(inv.total) || 0;
  if (total && gstPct) return Math.round(total - total / (1 + gstPct / 100));
  return 0;
}

function bucketizeOverdue(docs, dueField, amtField = 'balance') {
  const today = new Date();
  const out = { '0–30': 0, '31–60': 0, '61–90': 0, '90+': 0 };
  for (const d of docs) {
    const due = d[dueField] ? new Date(d[dueField]) : null;
    const amt = Number(d[amtField] ?? d.total ?? 0);
    if (!due || !amt) continue;
    const days = Math.floor((today - due) / (24 * 60 * 60 * 1000));
    if (days <= 0) continue;
    if (days <= 30) out['0–30'] += amt;
    else if (days <= 60) out['31–60'] += amt;
    else if (days <= 90) out['61–90'] += amt;
    else out['90+'] += amt;
  }
  return out;
}

router.get('/', async (req, res) => {
  try {
    // tenant guard
    const tenantId = req.tenantId || (req.headers['x-tenant-id'] || '').toString().trim().toLowerCase();
    if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id' });

    // date range
    const today = new Date();
    const defFrom = new Date(); defFrom.setDate(defFrom.getDate() - 29);
    const from = toDate(req.query.from, defFrom);
    const to = toDate(req.query.to, today);

    // helpers
    const scoped = (extra = {}) => ({ tenantId, ...extra });
    const range = (field) => ({ [field]: { $gte: from, $lte: to } });

    // ---------- Invoices in range ----------
    // tolerate date field variations: date | invoiceDate | createdAt
    const invFilter = scoped({
      $or: [
        range('date'),
        range('invoiceDate'),
        range('createdAt'),
      ],
    });
    const invProj = 'number invoiceNo customerName date invoiceDate dueDate status total subtotal tax gst gstPct gstAmount lines items createdAt';
    const invs = await Invoice.find(invFilter, invProj).sort({ invoiceDate: -1, date: -1, createdAt: -1 }).lean();

    const pickInvDate = (i) => i.date || i.invoiceDate || i.createdAt;
    const normStatus = (s) => String(s || '').toLowerCase();

    const invTotalAmt = invs.reduce((a, b) => a + (Number(b.total) || 0), 0);
    const invCount = invs.length;
    const gstCollected = invs.reduce((a, b) => a + gstFromInvoice(b), 0);
    const avg = invCount ? Math.round(invTotalAmt / invCount) : 0;

    // Top customers (within range)
    const byCust = {};
    for (const i of invs) {
      const name = i.customerName || '—';
      byCust[name] = (byCust[name] || 0) + (Number(i.total) || 0);
    }
    const topCustomers = Object.entries(byCust)
      .map(([customer, total]) => ({ customer, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // ---------- Payments in range (latest 10) ----------
    // tolerate: date | paidAt | createdAt
    const payFilter = scoped({
      $or: [
        range('date'),
        range('paidAt'),
        range('createdAt'),
      ],
    });
    const pays = await Payment.find(payFilter, 'date paidAt createdAt amount method customerName invoiceNumber id')
      .sort({ date: -1, paidAt: -1, createdAt: -1 })
      .limit(10)
      .lean();

    const pickPayDate = (p) => p.date || p.paidAt || p.createdAt;
    const payTotalAmt = pays.reduce((a, b) => a + (Number(b.amount) || 0), 0);
    const payCount = pays.length;

    const recentPayments = pays.map((p) => ({
      id: p.id || String(p._id),
      date: iso(pickPayDate(p)),
      customer: p.customerName || '',
      invoice: p.invoiceNumber || '',
      method: p.method || '',
      amount: Number(p.amount) || 0,
    }));

    // ---------- Bills (AP) in range for tiles ----------
    // tolerate: date | billDate | createdAt
    const billFilter = scoped({
      $or: [
        range('date'),
        range('billDate'),
        range('createdAt'),
      ],
    });
    const bills = await Bill.find(billFilter, 'status amount total balance date billDate createdAt due').lean();

    const billAmount = (b) => Number(b.amount ?? b.total) || 0;
    const apOpenAmt = bills
      .filter((b) => ['open', 'Open'].includes(String(b.status)))
      .reduce((a, b) => a + billAmount(b), 0);
    const apOverdueAmt = bills
      .filter((b) => ['overdue', 'Overdue'].includes(String(b.status)))
      .reduce((a, b) => a + billAmount(b), 0);

    // ---------- Aging (global open/overdue; not range-limited) ----------
    const arDocs = await Invoice.find(
      scoped({ status: { $in: ['open', 'overdue', 'Open', 'Overdue'] } }),
      'dueDate balance total'
    ).lean();
    const apDocs = await Bill.find(
      scoped({ status: { $in: ['open', 'overdue', 'Open', 'Overdue'] } }),
      'due balance total'
    ).lean();
    const arBuckets = bucketizeOverdue(arDocs, 'dueDate', 'balance');
    const apBuckets = bucketizeOverdue(apDocs, 'due', 'balance');

    // normalize for UI tables
    const toRows = (m) => Object.entries(m).map(([bucket, amount]) => ({ bucket, amount }));

    res.json({
      summary: {
        invoices: { totalAmt: invTotalAmt, count: invCount, avg, gstCollected },
        payments: { totalAmt: payTotalAmt, count: payCount },
        ap: { openAmt: apOpenAmt, overdueAmt: apOverdueAmt },
      },
      arAging: toRows(arBuckets),
      apAging: toRows(apBuckets),
      invoices: invs.map((i) => ({
        number: i.number || i.invoiceNo || '',
        customerName: i.customerName || '',
        date: iso(pickInvDate(i)),
        status: normStatus(i.status) === 'paid' ? 'Paid'
              : normStatus(i.status) === 'overdue' ? 'Overdue'
              : 'Open',
        total: Number(i.total) || 0,
        dueDate: i.dueDate ? iso(i.dueDate) : undefined,
      })),
      topCustomers,
      recentPayments,
      range: { from: iso(from), to: iso(to) },
    });
  } catch (err) {
    console.error('[reports]', err);
    res.status(500).json({ error: 'Reports failed' });
  }
});

export default router;
