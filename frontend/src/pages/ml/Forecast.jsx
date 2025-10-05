// src/pages/ml/Forecast.jsx
import React, { useEffect, useMemo, useState } from 'react'
import Page from '../../components/Page'
import Card, { CardHeader, CardBody } from '../../components/ui/Card'
import { TableWrap, DataTable } from '../../components/ui/Table'
import { Btn, BtnGhost } from '../../components/ui/Buttons'
import { notify } from '../../components/ui/Toast'
import { data as store, inr, dd } from '../../data/store'

/* ------------------------------- helpers -------------------------------- */
const toDate = (d) => (d ? new Date(d) : null)
const atMidnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x }
const daysBetween = (a, b) => Math.floor((atMidnight(b) - atMidnight(a)) / (24*60*60*1000))
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const fmt = (d) => (d ? d.toISOString().slice(0,10) : '')

/* Learn historical average delay (invoice date -> payment date), approx by name */
function learnDelays(invoices, payments) {
  const overall = []
  const perCustomer = {}
  const payIdx = {}
  payments.forEach(p => {
    const key = (p.customer || '—').toLowerCase()
    if (!payIdx[key]) payIdx[key] = []
    payIdx[key].push(p)
  })
  invoices.forEach(inv => {
    if (inv.status !== 'Paid') return
    const custKey = (inv.customerName || '—').toLowerCase()
    const invDate = toDate(inv.date)
    const candidates = (payIdx[custKey] || []).filter(p => toDate(p.date))
    if (!candidates.length || !invDate) return
    let best = null, bestDelta = Infinity
    candidates.forEach(p => {
      const delta = daysBetween(invDate, toDate(p.date))
      if (delta >= 0 && delta < bestDelta) { best = p; bestDelta = delta }
    })
    if (best) {
      overall.push(bestDelta)
      ;(perCustomer[custKey] ||= []).push(bestDelta)
    }
  })
  const avg = (arr) => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0
  return {
    overallAvg: avg(overall),
    perCustomerAvg: Object.fromEntries(Object.entries(perCustomer).map(([k, arr]) => [k, avg(arr)]))
  }
}

/* Light risk score reused for forecast shifting */
function riskScore(inv) {
  const due = toDate(inv.dueDate || inv.due)
  const today = new Date()
  const dpd = due ? daysBetween(due, today) : 0
  let s = 0
  if (inv.status === 'Overdue') s += 25 + clamp(dpd, 0, 30)
  const amt = Number(inv.total) || 0
  s += amt > 50000 ? 15 : amt > 10000 ? 8 : 3
  return clamp(Math.round(s), 0, 100)
}

/* Expected date baseline (no probabilistic spreading yet) */
function expectedDate(inv, opts, learned) {
  const today = atMidnight(new Date())
  const invDate = toDate(inv.date)
  let due = toDate(inv.dueDate || inv.due)
  if (!due && invDate) due = addDays(invDate, opts.defaultTerms)
  if (!due) return null

  const custKey = (inv.customerName || '—').toLowerCase()
  const baseDelay = learned.perCustomerAvg[custKey] ?? learned.overallAvg ?? 0

  // risk multiplier
  const r = riskScore(inv)
  let mult = 1
  if (r >= 80) mult = opts.multCritical
  else if (r >= 60) mult = opts.multHigh
  else if (r >= 35) mult = opts.multMedium

  // collection push pulls earlier
  const pull = -Math.abs(opts.collectionPush)
  const shiftDays = Math.round(baseDelay * mult) + pull
  let est = addDays(due, shiftDays)

  if (est < today) est = today
  const horizonEnd = addDays(today, opts.horizonDays-1)
  if (est > horizonEnd) est = horizonEnd
  return atMidnight(est)
}

/* Prob. mass over N days. shape: 'geometric' | 'linear' | 'flat'
   risk tweaks tail-heaviness for geometric. Returns array of length N summing to 1. */
function probMass(N, shape, risk) {
  const n = Math.max(1, N)
  if (shape === 'flat') return Array.from({length:n},()=>1/n)

  if (shape === 'linear') {
    // front-loaded linear: weights n, n-1, ..., 1
    const w = Array.from({length:n},(_,i)=> n - i)
    const s = w.reduce((a,b)=>a+b,0)
    return w.map(x => x/s)
  }

  // geometric (front-loaded with tail). Risk increases tail (smaller p)
  // base p ~ 0.6; risk 0..100 -> p in [0.75 .. 0.45]
  const p = 0.75 - (clamp(risk,0,100)/100)*0.30
  const w = Array.from({length:n},(_,k)=> Math.pow(1-p, k))
  const s = w.reduce((a,b)=>a+b,0)
  return w.map(x => x/s)
}

/* Build forecast with probabilistic spreading and optional early-payment discount what-if */
function buildForecast(invoices, payments, opts) {
  const learned = learnDelays(invoices, payments)
  const today = atMidnight(new Date())
  const days = Array.from({ length: opts.horizonDays }, (_, i) => fmt(addDays(today, i)))
  const buckets = Object.fromEntries(days.map(d => [d, 0]))

  const detail = [] // per-invoice expected slices (for export/inspection)

  invoices
    .filter(i => i.status !== 'Paid')
    .forEach(i => {
      const baseEst = expectedDate(i, opts, learned)
      const baseAmt = Number(i.total) || 0
      if (!baseEst || !baseAmt) return

      const r = riskScore(i)
      const mass = probMass(opts.spreadDays, opts.spreadShape, r)
      const horizonEnd = addDays(today, opts.horizonDays-1)

      // What-if split: a portion (uptakeRate) accepts discount and pays earlier with reduced amount
      const uptake = clamp(opts.discountUptake/100, 0, 1)
      const disc = clamp(opts.discountPercent/100, 0, 1)
      const shift = Math.max(0, Math.round(opts.discountPullForwardDays))
      const earlyAmt = baseAmt * uptake * (1 - disc)
      const normalAmt = baseAmt * (1 - uptake)

      // normal portion spread from baseEst forward
      mass.forEach((p, idx) => {
        let d = addDays(baseEst, idx)
        if (d > horizonEnd) d = horizonEnd
        const key = fmt(d)
        const slice = normalAmt * p
        buckets[key] = (buckets[key] || 0) + slice
        if (slice > 0) detail.push({
          expectedDate: key, number: i.number, customer: i.customerName || '—',
          status: i.status || 'Open', risk: r, portion: 'normal', amount: Math.round(slice)
        })
      })

      // discounted early portion spread from (baseEst - shift) forward
      if (earlyAmt > 0 && shift > 0) {
        mass.forEach((p, idx) => {
          let d = addDays(baseEst, Math.max(0, idx - shift))
          if (d < today) d = today
          if (d > horizonEnd) d = horizonEnd
          const key = fmt(d)
          const slice = earlyAmt * p
          buckets[key] = (buckets[key] || 0) + slice
          if (slice > 0) detail.push({
            expectedDate: key, number: i.number, customer: i.customerName || '—',
            status: i.status || 'Open', risk: r, portion: 'discounted', amount: Math.round(slice)
          })
        })
      }
    })

  const dailyRows = days.map(d => ({ date: d, amount: Math.round(buckets[d] || 0) }))
  const total = dailyRows.reduce((a,b)=>a + b.amount, 0)

  // Top expected payers (aggregate by invoice across slices → earliest date + sum)
  const agg = {}
  detail.forEach(x => {
    const key = x.number
    if (!agg[key]) agg[key] = { number: x.number, customer: x.customer, earliest: x.expectedDate, amount: 0, risk: x.risk, status: x.status }
    agg[key].amount += x.amount
    if (new Date(x.expectedDate) < new Date(agg[key].earliest)) agg[key].earliest = x.expectedDate
  })
  const topPayers = Object.values(agg)
    .sort((a,b) => new Date(a.earliest) - new Date(b.earliest) || b.amount - a.amount)
    .slice(0, 10)

  return { dailyRows, total, detail, topPayers, learned }
}

/* -------------------------------- Component ------------------------------- */
export default function MLForecast() {
  const invoices = store.invoices || []
  const payments = store.payments || []

  // Assumptions + What-If controls
  const [opts, setOpts] = useState({
    horizonDays: 30,
    defaultTerms: 30,     // if invoice lacks due date: invoice date + this
    multMedium: 1.2,      // risk multipliers (push later)
    multHigh: 1.6,
    multCritical: 2.0,
    collectionPush: 3,    // days pulled earlier due to follow-ups

    // Probabilistic spread
    spreadDays: 7,                 // distribute across these future days
    spreadShape: 'geometric',      // 'geometric' | 'linear' | 'flat'

    // What-If: Early-Payment Discount
    discountPercent: 2,            // % discount given
    discountUptake: 35,            // % of customers accepting discount
    discountPullForwardDays: 5     // days earlier for the discounted portion
  })

  const { dailyRows, total, detail, topPayers, learned } = useMemo(
    () => buildForecast(invoices, payments, opts),
    [invoices, payments, opts]
  )

  // Exports
  const exportSchedule = () => downloadCSV(dailyRows, ['date','amount'], 'cash-in-forecast.csv')
  const exportDetail = () => downloadCSV(detail, ['expectedDate','number','customer','status','risk','portion','amount'], 'cash-in-forecast-detail.csv')

  return (
    <Page
      title="Cash-In Forecast"
      subtitle="Probabilistic schedule of incoming cash with an early-payment discount scenario."
      actions={
        <div className="flex gap-2">
          <BtnGhost onClick={exportSchedule}>Export schedule</BtnGhost>
          <BtnGhost onClick={exportDetail}>Export detail</BtnGhost>
        </div>
      }
    >
      {/* Assumptions */}
      <Card>
        <CardHeader title="Assumptions" subtitle="Tune the model & what-if parameters" />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Field label="Horizon (days)">
              <select className={inClass()} value={opts.horizonDays}
                onChange={(e)=>setOpts({...opts, horizonDays: Number(e.target.value)})}>
                {[14,30,45,60,90].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Default terms (Net)">
              <select className={inClass()} value={opts.defaultTerms}
                onChange={(e)=>setOpts({...opts, defaultTerms: Number(e.target.value)})}>
                {[7,15,30,45].map(d => <option key={d} value={d}>Net {d}</option>)}
              </select>
            </Field>
            <Field label="Medium risk ×">
              <input type="number" step="0.1" className={inClass()} value={opts.multMedium}
                onChange={(e)=>setOpts({...opts, multMedium: Number(e.target.value)})}/>
            </Field>
            <Field label="High risk ×">
              <input type="number" step="0.1" className={inClass()} value={opts.multHigh}
                onChange={(e)=>setOpts({...opts, multHigh: Number(e.target.value)})}/>
            </Field>
            <Field label="Critical risk ×">
              <input type="number" step="0.1" className={inClass()} value={opts.multCritical}
                onChange={(e)=>setOpts({...opts, multCritical: Number(e.target.value)})}/>
            </Field>
            <Field label="Collection push (days)">
              <input type="number" className={inClass()} value={opts.collectionPush}
                onChange={(e)=>setOpts({...opts, collectionPush: Number(e.target.value)})}/>
            </Field>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Field label="Spread days">
              <select className={inClass()} value={opts.spreadDays}
                onChange={(e)=>setOpts({...opts, spreadDays: Number(e.target.value)})}>
                {[3,5,7,10,14].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Spread shape">
              <select className={inClass()} value={opts.spreadShape}
                onChange={(e)=>setOpts({...opts, spreadShape: e.target.value})}>
                <option value="geometric">Geometric (front-loaded)</option>
                <option value="linear">Linear (front-loaded)</option>
                <option value="flat">Flat</option>
              </select>
            </Field>

            <Field label="What-If: Discount %">
              <input type="number" className={inClass()} value={opts.discountPercent}
                onChange={(e)=>setOpts({...opts, discountPercent: Number(e.target.value)})}/>
            </Field>
            <Field label="What-If: Uptake %">
              <input type="number" className={inClass()} value={opts.discountUptake}
                onChange={(e)=>setOpts({...opts, discountUptake: Number(e.target.value)})}/>
            </Field>
            <Field label="Pull forward (days)">
              <input type="number" className={inClass()} value={opts.discountPullForwardDays}
                onChange={(e)=>setOpts({...opts, discountPullForwardDays: Number(e.target.value)})}/>
            </Field>
          </div>

          <div className="mt-3 text-[12px] text-slate-600">
            <b>Learned from history:</b> Avg delay overall <b>{pluralDay(learned.overallAvg)}</b>
            {Object.keys(learned.perCustomerAvg||{}).length > 0 && <> • per-customer applied when available</>}
          </div>
        </CardBody>
      </Card>

      {/* Tiles */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <Tile tone="emerald" title="Forecast total" value={inr(total)} hint={`Next ${opts.horizonDays} days`} />
        <Tile tone="sky" title="Days with cash-in" value={dailyRows.filter(d=>d.amount>0).length} hint="Non-zero days" />
        <Tile tone="amber" title="Avg / active day" value={inr(avgNonZero(dailyRows))} hint="Across non-zero days" />
        <Tile tone="rose" title="Unpaid invoices" value={(store.invoices||[]).filter(i=>i.status!=='Paid').length} />
      </div>

      {/* Forecast schedule & Top payers */}
      <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Daily schedule" subtitle="Projected receipts per day (probabilistic)" />
          <CardBody>
            <TableWrap>
              <DataTable
                empty="No projected cash"
                initialSort={{ key: 'date', dir: 'asc' }}
                columns={[
                  { key: 'date', header: 'Date' },
                  { key: 'amount', header: 'Amount', align: 'right', render: (r)=>inr(r.amount) },
                ]}
                rows={dailyRows}
              />
            </TableWrap>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Top expected payers" subtitle="Soonest & largest (with what-if applied)" />
          <CardBody>
            <TableWrap>
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur text-slate-600">
                  <tr>
                    <th className="py-3 px-3 text-left">Earliest</th>
                    <th className="py-3 px-3 text-left">Invoice</th>
                    <th className="py-3 px-3 text-left">Customer</th>
                    <th className="py-3 px-3 text-right">Amount</th>
                    <th className="py-3 px-3 text-left">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topPayers.length === 0 && (
                    <tr><td colSpan="5" className="p-6 text-center text-slate-500">No candidates</td></tr>
                  )}
                  {topPayers.map(r => (
                    <tr key={r.number} className="hover:bg-slate-50">
                      <td className="py-3 px-3">{dd(r.earliest)}</td>
                      <td className="py-3 px-3"><a className="text-sky-700 hover:underline" href={`#/invoices?status=${r.status||'Open'}`}>{r.number}</a></td>
                      <td className="py-3 px-3">{r.customer}</td>
                      <td className="py-3 px-3 text-right">{inr(r.amount)}</td>
                      <td className="py-3 px-3"><Badge tone={r.risk >= 60 ? (r.risk>=80?'rose':'amber') : (r.risk>=35?'sky':'emerald')} label={r.risk}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </CardBody>
        </Card>
      </div>
    </Page>
  )
}

/* ------------------------------- small UI -------------------------------- */
function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-xs text-slate-600 mb-1">{label}</div>
      {children}
    </label>
  )
}
function inClass(){
  return 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400'
}
function Tile({ title, value, hint, tone='emerald' }) {
  const tones = {
    emerald: 'from-emerald-600 to-emerald-500',
    sky: 'from-sky-600 to-sky-500',
    amber: 'from-amber-600 to-amber-500',
    rose: 'from-rose-600 to-rose-500',
  }
  return (
    <div className="rounded-2xl p-[1px] bg-gradient-to-br from-slate-200 via-white to-slate-200 shadow-[0_6px_28px_rgba(15,23,42,.08)]">
      <div className="rounded-2xl bg-white">
        <div className={`px-4 py-3 rounded-t-2xl text-white bg-gradient-to-br ${tones[tone]}`}>
          <div className="text-[13px] font-medium opacity-95">{title}</div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[22px] font-semibold text-slate-900">{value}</div>
          {hint && <div className="text-[12px] text-slate-500">{hint}</div>}
        </div>
      </div>
    </div>
  )
}
function Badge({ tone='emerald', label }) {
  const map = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    sky: 'bg-sky-50 text-sky-700 border-sky-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  }
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs border ${map[tone]}`}>{label}</span>
}
function avgNonZero(rows){
  const non = rows.filter(r => r.amount > 0)
  return non.length ? Math.round(non.reduce((a,b)=>a+b.amount,0)/non.length) : 0
}
function pluralDay(d){ return `${Math.abs(d)} day${Math.abs(d)===1?'':'s'}` }

/* ------------------------------- CSV util -------------------------------- */
function downloadCSV(rows, headers, filename){
  if (!rows.length) { notify.info('Nothing to export'); return }
  const esc = (v)=> {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s
  }
  const csv = [headers.join(',')].concat(
    rows.map(r => headers.map(h => esc(r[h])).join(','))
  ).join('\n')
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href=url; a.download=filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  notify.success('Export ready', filename)
}
