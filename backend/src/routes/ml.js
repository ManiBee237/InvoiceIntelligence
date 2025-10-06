import express from 'express'
import Invoice from '../models/Invoice.js'
import Payment from '../models/Payment.js'

const router = express.Router()

/* ----------------------------- shared helpers ----------------------------- */
const atMidnight = (d) => {
  const x = new Date(d)
  return new Date(x.getFullYear(), x.getMonth(), x.getDate())
}
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '')
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const daysBetween = (a, b) => {
  const A = atMidnight(a)
  const B = atMidnight(b)
  return Math.floor((B - A) / (24 * 60 * 60 * 1000))
}
const num = (v, def) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

/* ------------------------------- LATEPAY API ------------------------------ */
router.get('/latepay', async (req, res) => {
  try {
    const tenantId = req.tenantId || req.headers['x-tenant-id']
    if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id' })

    const fields =
      'number date due dueDate customerName status total customerEmail customerPhone promiseDate lastReminded'
    const all = await Invoice.find({ tenantId }, fields).lean()

    // peer stats (overdues & average lateness)
    const peers = {}
    const today = new Date()
    for (const i of all) {
      const name = i.customerName || '—'
      if (!peers[name]) peers[name] = { overdues: 0, sumDaysPast: 0, count: 0, avgDaysPast: 0 }
      const due = i.dueDate || i.due ? new Date(i.dueDate || i.due) : null
      const dpd = due ? daysBetween(due, today) : 0
      const wasOver = i.status === 'Overdue' || (due && dpd > 0 && i.status !== 'Paid')
      if (wasOver) peers[name].overdues += 1
      peers[name].sumDaysPast += Math.max(0, dpd)
      peers[name].count += 1
    }
    Object.values(peers).forEach(v => { v.avgDaysPast = v.count ? Math.round(v.sumDaysPast / v.count) : 0 })

    const score = (inv) => {
      const due = inv.dueDate || inv.due ? new Date(inv.dueDate || inv.due) : null
      const today = new Date()
      const dpd = due ? daysBetween(due, today) : 0
      const amt = Number(inv.total) || 0
      const hist = peers[inv.customerName || '—'] || { overdues: 0, avgDaysPast: 0 }

      let pts = 0
      // overdue severity
      pts += clamp(dpd * 1.2, 0, 40)
      // approaching due (within 7 days)
      if (due && dpd <= 0 && dpd >= -7) pts += clamp((7 + dpd) * 2.0, 0, 12)
      // amount tier
      pts += amt <= 0 ? 0 : amt < 10000 ? 4 : amt < 50000 ? 8 : 12
      // customer history
      pts += clamp(hist.overdues * 4, 0, 16) + clamp(hist.avgDaysPast * 0.3, 0, 12)
      // contactability
      if (!inv.customerEmail && !inv.customerPhone) pts += 4
      // status nudge
      if (inv.status === 'Overdue') pts += 6

      return clamp(Math.round(pts), 0, 100)
    }
    const band = (s) => (s >= 80 ? 'Critical' : s >= 60 ? 'High' : s >= 35 ? 'Medium' : 'Low')

    const rows = all
      .filter(i => i.status !== 'Paid')
      .map(i => {
        const s = score(i)
        return {
          id: String(i._id),
          number: i.number,
          date: i.date,
          due: i.dueDate || i.due,
          customer: i.customerName || '—',
          amount: Number(i.total) || 0,
          status: i.status || 'Open',
          riskScore: s,
          riskBand: band(s),
          promiseDate: i.promiseDate || '',
          lastReminded: i.lastReminded || ''
        }
      })
      .sort((a, b) => b.riskScore - a.riskScore)

    res.json(rows)
  } catch (err) {
    console.error('[ml/latepay]', err)
    res.status(500).json({ error: 'Latepay failed' })
  }
})

/* ------------------------------ FORECAST API ------------------------------ */
function learnDelays(invoices, payments) {
  const overall = []
  const perCustomer = {}
  const payIdx = {}
  ;(payments || []).forEach(p => {
    const key = (p.customer || '—').toLowerCase()
    ;(payIdx[key] ||= []).push(p)
  })
  ;(invoices || []).forEach(inv => {
    if (inv.status !== 'Paid') return
    const custKey = (inv.customerName || '—').toLowerCase()
    const invDate = inv.date ? new Date(inv.date) : null
    const candidates = (payIdx[custKey] || []).filter(p => p.date)
    if (!invDate || !candidates.length) return
    let bestDelta = Infinity
    candidates.forEach(p => {
      const delta = daysBetween(invDate, p.date)
      if (delta >= 0 && delta < bestDelta) bestDelta = delta
    })
    if (bestDelta !== Infinity) {
      overall.push(bestDelta)
      ;(perCustomer[custKey] ||= []).push(bestDelta)
    }
  })
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0)
  return {
    overallAvg: avg(overall),
    perCustomerAvg: Object.fromEntries(Object.entries(perCustomer).map(([k, arr]) => [k, avg(arr)]))
  }
}

function riskScore(inv) {
  const due = inv.dueDate || inv.due ? new Date(inv.dueDate || inv.due) : new Date()
  const today = new Date()
  const dpd = daysBetween(due, today)
  let s = 0
  if (inv.status === 'Overdue') s += 25 + clamp(dpd, 0, 30)
  const amt = Number(inv.total) || 0
  s += amt > 50000 ? 15 : amt > 10000 ? 8 : 3
  return clamp(Math.round(s), 0, 100)
}

function probMass(N, shape, risk) {
  const n = Math.max(1, N)
  if (shape === 'flat') return Array.from({ length: n }, () => 1 / n)
  if (shape === 'linear') {
    const w = Array.from({ length: n }, (_, i) => n - i)
    const s = w.reduce((a, b) => a + b, 0)
    return w.map(x => x / s)
  }
  // geometric (front-loaded), risk ↑ → longer tail
  const p = 0.75 - (clamp(risk, 0, 100) / 100) * 0.30
  const w = Array.from({ length: n }, (_, k) => Math.pow(1 - p, k))
  const s = w.reduce((a, b) => a + b, 0)
  return w.map(x => x / s)
}

function expectedDate(inv, opts, learned) {
  const today = atMidnight(new Date())
  const invDate = inv.date ? new Date(inv.date) : null
  let due = inv.dueDate || inv.due ? new Date(inv.dueDate || inv.due) : null
  if (!due && invDate) due = addDays(invDate, opts.defaultTerms)
  if (!due) return null

  const custKey = (inv.customerName || '—').toLowerCase()
  const baseDelay = learned.perCustomerAvg[custKey] ?? learned.overallAvg ?? 0

  const r = riskScore(inv)
  let mult = 1
  if (r >= 80) mult = opts.multCritical
  else if (r >= 60) mult = opts.multHigh
  else if (r >= 35) mult = opts.multMedium

  const pull = -Math.abs(opts.collectionPush)
  const shiftDays = Math.round(baseDelay * mult) + pull
  let est = addDays(due, shiftDays)

  if (est < today) est = today
  const horizonEnd = addDays(today, opts.horizonDays - 1)
  if (est > horizonEnd) est = horizonEnd
  return atMidnight(est)
}

router.get('/forecast', async (req, res) => {
  try {
    const tenantId = req.tenantId || req.headers['x-tenant-id']
    if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id' })

    const opts = {
      horizonDays: num(req.query.horizonDays, 30),
      defaultTerms: num(req.query.defaultTerms, 30),
      multMedium: num(req.query.multMedium, 1.2),
      multHigh: num(req.query.multHigh, 1.6),
      multCritical: num(req.query.multCritical, 2.0),
      collectionPush: num(req.query.collectionPush, 3),
      spreadDays: num(req.query.spreadDays, 7),
      spreadShape: req.query.spreadShape || 'geometric',
      discountPercent: num(req.query.discountPercent, 2),
      discountUptake: num(req.query.discountUptake, 35),
      discountPullForwardDays: num(req.query.discountPullForwardDays, 5),
    }

    const [invoices, payments] = await Promise.all([
      Invoice.find({ tenantId }, 'number date due dueDate customerName status total').lean(),
      Payment.find({ tenantId }, 'date customer amount').lean(),
    ])

    const learned = learnDelays(invoices, payments)
    const today = atMidnight(new Date())
    const days = Array.from({ length: opts.horizonDays }, (_, i) => iso(addDays(today, i)))
    const buckets = Object.fromEntries(days.map(d => [d, 0]))
    const detail = []
    const horizonEnd = addDays(today, opts.horizonDays - 1)

    for (const inv of invoices) {
      if (inv.status === 'Paid') continue
      const baseEst = expectedDate(inv, opts, learned)
      const baseAmt = Number(inv.total) || 0
      if (!baseEst || !baseAmt) continue

      const r = riskScore(inv)
      const mass = probMass(opts.spreadDays, opts.spreadShape, r)

      const uptake = clamp(opts.discountUptake / 100, 0, 1)
      const disc = clamp(opts.discountPercent / 100, 0, 1)
      const shift = Math.max(0, Math.round(opts.discountPullForwardDays))
      const earlyAmt = baseAmt * uptake * (1 - disc)
      const normalAmt = baseAmt * (1 - uptake)

      // normal spread
      mass.forEach((p, idx) => {
        let d = addDays(baseEst, idx)
        if (d > horizonEnd) d = horizonEnd
        const key = iso(d)
        const slice = normalAmt * p
        buckets[key] += slice
        if (slice > 0) detail.push({
          expectedDate: key, number: inv.number, customer: inv.customerName || '—',
          status: inv.status || 'Open', risk: r, portion: 'normal', amount: Math.round(slice)
        })
      })

      // discounted early portion
      if (earlyAmt > 0 && shift > 0) {
        mass.forEach((p, idx) => {
          let d = addDays(baseEst, Math.max(0, idx - shift))
          if (d < today) d = today
          if (d > horizonEnd) d = horizonEnd
          const key = iso(d)
          const slice = earlyAmt * p
          buckets[key] += slice
          if (slice > 0) detail.push({
            expectedDate: key, number: inv.number, customer: inv.customerName || '—',
            status: inv.status || 'Open', risk: r, portion: 'discounted', amount: Math.round(slice)
          })
        })
      }
    }

    const dailyRows = days.map(d => ({ date: d, amount: Math.round(buckets[d] || 0) }))
    const total = dailyRows.reduce((a, b) => a + b.amount, 0)

    // aggregate to top payers
    const agg = {}
    detail.forEach(x => {
      const key = x.number
      if (!agg[key]) {
        agg[key] = { number: x.number, customer: x.customer, earliest: x.expectedDate, amount: 0, risk: x.risk, status: x.status }
      }
      agg[key].amount += x.amount
      if (new Date(x.expectedDate) < new Date(agg[key].earliest)) agg[key].earliest = x.expectedDate
    })
    const topPayers = Object.values(agg)
      .sort((a, b) => new Date(a.earliest) - new Date(b.earliest) || b.amount - a.amount)
      .slice(0, 10)

    res.json({ dailyRows, total, detail, topPayers, learned })
  } catch (err) {
    console.error('[ml/forecast]', err)
    res.status(500).json({ error: 'Forecast failed' })
  }
})

export default router
