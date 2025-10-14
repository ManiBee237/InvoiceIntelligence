// src/pages/Dashboard.jsx
import React, { useMemo, useState, useEffect } from 'react'
import Page from '../components/Page'
import Card, { CardHeader, CardBody, Divider } from '../components/ui/Card'
import { TableWrap } from '../components/ui/Table'
import { inr, dd } from '../data/store'
import { api } from '../lib/api'

/* utils */
const toDate = (d) => (d ? new Date(d) : null)
const isWithin = (d, from, to) => !!d && d >= from && d <= to
const sum = (arr, f = (x) => x) => (Array.isArray(arr) ? arr.reduce((a, b) => a + (Number(f(b)) || 0), 0) : 0)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const todayISO = () => new Date().toISOString().slice(0,10)
const title = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s)

/* viz */
function Sparkline({ points = [], className = '' }) {
  const w = 120, h = 34, p = 2
  if (!points || !points.length) return <svg width={w} height={h}/>
  const min = Math.min(...points), max = Math.max(...points)
  const norm = (v) => (max === min ? h/2 : h - p - ((v - min) / (max - min)) * (h - p*2))
  const step = (w - p*2) / Math.max(1, points.length - 1)
  const d = points.map((v, i) => `${i ? 'L' : 'M'} ${p + i*step} ${norm(v)}`).join(' ')
  return <svg width={w} height={h} className={className} aria-hidden="true"><path d={d} fill="none" vectorEffect="non-scaling-stroke" strokeWidth="2" stroke="currentColor" /></svg>
}
function ProgressRing({ value = 0, size = 72, stroke = 8 }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  const off = c - (clamp(value, 0, 100) / 100) * c
  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} stroke="rgb(226 232 240)" strokeWidth={stroke} fill="none"/>
        <circle cx={size/2} cy={size/2} r={r} stroke="rgb(16 185 129)" strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size/2} ${size/2})`} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-700">
        {Math.round(value)}%
      </div>
    </div>
  )
}
function Tile({ href, emoji, title, value, hint, trend = [] , tone = 'emerald' }) {
  const toneMap = { emerald:'from-emerald-600 to-emerald-500', sky:'from-sky-600 to-sky-500', amber:'from-amber-600 to-amber-500', rose:'from-rose-600 to-rose-500' }
  return (
    <a href={href} className="block group focus:outline-none focus:ring-2 focus:ring-emerald-400 rounded-2xl">
      <div className="rounded-2xl p-[1px] bg-gradient-to-br from-slate-200 via-white to-slate-200 shadow-[0_6px_28px_rgba(15,23,42,.10)] group-hover:shadow-[0_10px_36px_rgba(15,23,42,.14)] transition">
        <div className="rounded-2xl bg-white">
          <div className={`px-4 pt-4 pb-3 rounded-t-2xl text-white bg-gradient-to-br ${toneMap[tone]}`}>
            <div className="flex items-center gap-2">
              <div className="text-xl">{emoji}</div>
              <div className="text-[13px] font-medium opacity-95">{title}</div>
            </div>
            <div className="mt-2 text-2xl font-semibold">{value}</div>
            {hint && <div className="text-[12px] opacity-90">{hint}</div>}
          </div>
          <div className="px-3 py-2 text-slate-500">
            <Sparkline points={trend} className="text-emerald-500" />
          </div>
        </div>
      </div>
    </a>
  )
}

/* normalize records */
const normInvoice = (x) => ({
  id: x.id || x._id,
  number: x.number || x.invoiceNo || '',
  customerName: x.customerName || x.customer || '',
  total: Number(x.total) || 0,
  date: x.date || x.invoiceDate || x.createdAt || null,
  dueDate: x.dueDate || null,
  // statuses vary; keep raw and a lc copy
  statusRaw: x.status || '',
  statusLc: (x.status || '').toLowerCase(),
})
const normPayment = (p) => ({
  id: p.id || p._id,
  customer: p.customer || p.customerName || '',
  amount: Number(p.amount) || 0,
  date: p.date || p.createdAt || null,
  method: p.method || 'Bank',
})
const normBill = (b) => ({
  id: b.id || b._id,
  billNo: b.billNo || '',
  vendorName: b.vendorName || b.vendor || '',
  date: b.billDate || b.createdAt || null,
  dueDate: b.dueDate || null,
  amount: Number(b.total ?? b.amount ?? 0) || 0,
  status: title(b.status) || 'Open', // show Title Case
})

/* classify invoice by dates + status */
function classifyInvoices(inv) {
  const todayMid = new Date(new Date().toDateString())
  const paid = inv.filter(i => i.statusLc === 'paid')
  const overdue = inv.filter(i => i.statusLc !== 'paid' && i.dueDate && toDate(i.dueDate) < todayMid)
  const open = inv.filter(i => i.statusLc !== 'paid' && (!i.dueDate || toDate(i.dueDate) >= todayMid))
  return { open, overdue, paid }
}

/* page */
export default function Dashboard() {
  const [range, setRange] = useState('30d')
  const today = new Date()
  const from = useMemo(() => {
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30
    const d = new Date(today); d.setDate(d.getDate() - days + 1); return d
  }, [range, today])

  const [invoices, setInvoices] = useState([])
  const [payments, setPayments] = useState([])
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        // fetch EVERYTHING; no status filters (avoids 422)
        const [allInv, pays, bls] = await Promise.all([
          api('/api/invoices?limit=500'),
          api('/api/payments?limit=500'),
          api('/api/bills?limit=500'),
        ])
        if (!alive) return
        setInvoices((Array.isArray(allInv) ? allInv : []).map(normInvoice))
        setPayments((Array.isArray(pays) ? pays : []).map(normPayment))
        setBills((Array.isArray(bls) ? bls : []).map(normBill))
      } catch (e) {
        if (alive) setError(e?.message || 'Failed to load dashboard')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  /* classify after normalization */
  const { open: openInv, overdue: overdueInv, paid: paidInv } = useMemo(
    () => classifyInvoices(invoices),
    [invoices]
  )

  /* range filters */
  const invInRange = useMemo(
    () => invoices.filter(i => isWithin(toDate(i.date), from, today)),
    [invoices, from, today]
  )
  const payInRange = useMemo(
    () => payments.filter(p => isWithin(toDate(p.date), from, today)),
    [payments, from, today]
  )

  /* KPIs */
  const arOpenAmt    = sum(openInv, (i)=>i.total)
  const arOverdueCnt = overdueInv.length
  const overdueAmt   = sum(overdueInv, (i)=>i.total)
  const paidAmt      = sum(paidInv, (i)=>i.total)

  const apOpenAmt    = sum(bills.filter(b => b.status === 'Open'), (b)=>b.amount)
  const apOverdueCnt = bills.filter(b => b.status === 'Overdue').length

  const cashIn = sum(payInRange, (p)=> p.amount)
  const collectible = paidAmt + arOpenAmt + overdueAmt
  const collectionRate = collectible > 0 ? (paidAmt / collectible) * 100 : 0

  /* trends (14d) */
  const days = useMemo(() => Array.from({length: 14}, (_,k) => {
    const d = new Date(today); d.setDate(d.getDate() - (13 - k)); return d.toISOString().slice(0,10)
  }), [today])
  const trendInvoices = days.map(day => invoices.filter(i => String(i.date||'').slice(0,10) === day).length)
  const trendPayments = days.map(day => sum(payments.filter(p => String(p.date||'').slice(0,10) === day), p => p.amount))
  const trendBills    = days.map(day => bills.filter(b => String(b.date||'').slice(0,10) === day).length)

  /* recent + upcoming */
  const recentInv  = [...invInRange].sort((a,b)=> new Date(b.date)-new Date(a.date)).slice(0,5)
  const recentPay  = [...payInRange].sort((a,b)=> new Date(b.date)-new Date(a.date)).slice(0,5)
  const upcomingBills = useMemo(() => (
    [...bills]
      .filter(b => {
        const d = toDate(b.dueDate)
        const todayMid = new Date(new Date().toDateString())
        return d && d >= todayMid
      })
      .sort((a,b)=> new Date(a.dueDate) - new Date(b.dueDate))
      .slice(0,5)
  ), [bills])

  return (
    <Page title="Dashboard" subtitle="Key metrics and quick links">
      {/* Top controls */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-600">Showing last&nbsp;
          <select
            value={range}
            onChange={(e)=>setRange(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
          >
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <a href="#/invoices#new" className="rounded-lg bg-emerald-600 text-white text-sm px-3 py-2 hover:bg-emerald-500">+ New Invoice</a>
          <a href="#/payments#new" className="rounded-lg border border-slate-200 bg-white text-sm px-3 py-2 text-slate-700 hover:bg-slate-50">+ Record Payment</a>
          <a href="#/customers#new" className="rounded-lg border border-slate-200 bg-white text-sm px-3 py-2 text-slate-700 hover:bg-slate-50">+ Add Customer</a>
          <a href="#/bills#new" className="rounded-lg border border-slate-200 bg-white text-sm px-3 py-2 text-slate-700 hover:bg-slate-50">+ New Bill</a>
        </div>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Tile href="#/invoices?status=Overdue" emoji="📮" title="AR Overdue" value={loading ? '…' : arOverdueCnt} hint="Invoices past due" trend={trendInvoices} tone="rose" />
        <Tile href="#/invoices?status=Open" emoji="🧾" title="AR Open" value={loading ? '…' : inr(arOpenAmt)} hint="Unpaid invoices" trend={trendInvoices} tone="amber" />
        <Tile href="#/bills?status=Overdue" emoji="📤" title="AP Overdue" value={loading ? '…' : apOverdueCnt} hint="Bills past due" trend={trendBills} tone="sky" />
        <Tile href="#/payments" emoji="💸" title={`Cash In (${range})`} value={loading ? '…' : inr(cashIn)} hint="Received payments" trend={trendPayments} tone="emerald" />
      </div>

      {/* Collections + AR/AP + Top customers */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader title="Collections rate" subtitle="Paid vs collectible" />
          <CardBody className="flex items-center gap-4">
            <ProgressRing value={collectionRate} />
            <div className="text-sm text-slate-700">
              <div className="font-medium">Paid: <span className="text-slate-900">{inr(paidAmt)}</span></div>
              <div>Open + Overdue: <span className="text-slate-900">{inr(collectible - paidAmt)}</span></div>
            </div>
          </CardBody>
          <Divider />
          <CardBody className="text-xs text-slate-500">Improve rate by collecting past-due invoices and offering early-pay discounts.</CardBody>
        </Card>

        <Card>
          <CardHeader title="Accounts Receivable snapshot" subtitle="Totals by status" />
          <CardBody>
            <ul className="text-sm space-y-2">
              <li className="flex justify-between"><span>Open</span><span className="font-medium">{inr(arOpenAmt)}</span></li>
              <li className="flex justify-between"><span>Overdue</span><span className="font-medium">{inr(overdueAmt)}</span></li>
              <li className="flex justify-between"><span>Paid</span><span className="font-medium">{inr(sum(paidInv, i=>i.total))}</span></li>
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Accounts Payable snapshot" subtitle="Totals by status" />
          <CardBody>
            <ul className="text-sm space-y-2">
              <li className="flex justify-between"><span>Open</span><span className="font-medium">{inr(sum(bills.filter(b=>b.status==='Open'), b=>b.amount))}</span></li>
              <li className="flex justify-between"><span>Overdue</span><span className="font-medium">{inr(sum(bills.filter(b=>b.status==='Overdue'), b=>b.amount))}</span></li>
              <li className="flex justify-between"><span>Paid</span><span className="font-medium">{inr(sum(bills.filter(b=>b.status==='Paid'), b=>b.amount))}</span></li>
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Top customers (90d)" subtitle="By invoiced amount" />
          <CardBody>
            <TopCustomers invoices={invoices} />
          </CardBody>
        </Card>
      </div>

      {/* Recent & Upcoming */}
      <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Recent invoices" subtitle={`Last ${range}`} />
          <CardBody>
            <TableWrap>
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur text-slate-600">
                  <tr>
                    <th className="py-3 px-3 text-left">#</th>
                    <th className="py-3 px-3 text-left">Customer</th>
                    <th className="py-3 px-3 text-right">Total</th>
                    <th className="py-3 px-3 text-left">Date</th>
                    <th className="py-3 px-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...recentInv].length === 0 && (
                    <tr><td colSpan="5" className="p-6 text-center text-slate-500">{loading ? 'Loading…' : 'No invoices'}</td></tr>
                  )}
                  {[...recentInv].map(r => (
                    <tr key={r.id || r.number} className="hover:bg-slate-50">
                      <td className="py-3 px-3"><a className="text-sky-700 hover:underline" href={`#/invoices?status=${r.statusRaw||'Open'}`}>{r.number}</a></td>
                      <td className="py-3 px-3">{r.customerName}</td>
                      <td className="py-3 px-3 text-right">{inr(r.total)}</td>
                      <td className="py-3 px-3">{dd(r.date)}</td>
                      <td className="py-3 px-3">
                        <span className={
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs border ' +
                          (r.statusLc === 'paid'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : (r.dueDate && toDate(r.dueDate) < new Date(new Date().toDateString()))
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-sky-50 text-sky-700 border-sky-200')
                        }>
                          {r.statusRaw ? title(r.statusRaw) : 'Open'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Recent payments" subtitle={`Last ${range}`} />
          <CardBody>
            <TableWrap>
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur text-slate-600">
                  <tr>
                    <th className="py-3 px-3 text-left">ID</th>
                    <th className="py-3 px-3 text-left">Customer</th>
                    <th className="py-3 px-3 text-right">Amount</th>
                    <th className="py-3 px-3 text-left">Date</th>
                    <th className="py-3 px-3 text-left">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...recentPay].length === 0 && (
                    <tr><td colSpan="5" className="p-6 text-center text-slate-500">{loading ? 'Loading…' : 'No payments'}</td></tr>
                  )}
                  {[...recentPay].map(r => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="py-3 px-3"><a className="text-sky-700 hover:underline" href="#/payments">{r.id}</a></td>
                      <td className="py-3 px-3">{r.customer}</td>
                      <td className="py-3 px-3 text-right">{inr(r.amount)}</td>
                      <td className="py-3 px-3">{dd(r.date)}</td>
                      <td className="py-3 px-3">
                        <span className={
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs border ' +
                          (r.method === 'UPI'
                            ? 'bg-sky-50 text-sky-700 border-sky-200'
                            : r.method === 'Card'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : r.method === 'Cash'
                            ? 'bg-slate-50 text-slate-700 border-slate-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                        }>{r.method || 'Bank'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </CardBody>
        </Card>
      </div>

      {/* Upcoming bills */}
      <div className="mt-4">
        <Card>
          <CardHeader title="Upcoming bills" subtitle="Next 5 payable items" />
          <CardBody>
            <TableWrap>
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur text-slate-600">
                  <tr>
                    <th className="py-3 px-3 text-left">Bill #</th>
                    <th className="py-3 px-3 text-left">Vendor</th>
                    <th className="py-3 px-3 text-left">Due</th>
                    <th className="py-3 px-3 text-right">Amount</th>
                    <th className="py-3 px-3 text-left">Status</th>
                    <th className="py-3 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {upcomingBills.length === 0 && (
                    <tr><td colSpan="6" className="p-6 text-center text-slate-500">{loading ? 'Loading…' : 'No upcoming bills'}</td></tr>
                  )}
                  {upcomingBills.map(b => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="py-3 px-3"><a className="text-sky-700 hover:underline" href={`#/bills?status=${b.status||'Open'}`}>{b.billNo || b.id.slice(-6)}</a></td>
                      <td className="py-3 px-3">{b.vendorName}</td>
                      <td className="py-3 px-3">{dd(b.dueDate)}</td>
                      <td className="py-3 px-3 text-right">{inr(b.amount)}</td>
                      <td className="py-3 px-3">
                        <span className={
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs border ' +
                          (b.status === 'Paid'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : b.status === 'Overdue'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200')
                        }>
                          {b.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <a href="#/payments#new" className="text-emerald-700 hover:underline">Pay</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </CardBody>
        </Card>
      </div>

      {error && <div className="mt-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{error}</div>}
    </Page>
  )
}

/* Top customers computed locally (last 90 days by amount) */
function TopCustomers({ invoices }) {
  const ninetyAgo = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 89); return d
  }, [])
  const inRange = useMemo(() => invoices.filter(i => isWithin(toDate(i.date), ninetyAgo, new Date())), [invoices, ninetyAgo])
  const totals = useMemo(() => {
    const map = new Map()
    for (const i of inRange) {
      const name = i.customerName || 'Unknown'
      map.set(name, (map.get(name) || 0) + (Number(i.total) || 0))
    }
    return [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5)
  }, [inRange])
  if (!totals.length) return <div className="text-slate-500">No data</div>
  return (
    <ul className="text-sm space-y-2">
      {totals.map(([name, amt]) => (
        <li key={name} className="flex justify-between">
          <span>{name}</span><span className="font-medium">{inr(amt)}</span>
        </li>
      ))}
    </ul>
  )
}
