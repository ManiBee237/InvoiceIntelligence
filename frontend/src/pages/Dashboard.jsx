// src/pages/Dashboard.jsx
import React, { useMemo, useState, useEffect } from 'react'
import Page from '../components/Page'
import Card, { CardHeader, CardBody, Divider } from '../components/ui/Card'
import { TableWrap } from '../components/ui/Table'
import { inr, dd } from '../data/store'
import { api } from '../lib/api'

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */
const toDate = (d) => (d ? new Date(d) : null)
const isWithin = (d, from, to) => !!d && d >= from && d <= to
const sum = (arr, f = (x) => x) => arr.reduce((a, b) => a + f(b), 0)
const count = (arr, f = () => true) => arr.filter(f).length
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

function Sparkline({ points = [], className = '' }) {
  const w = 120, h = 34, p = 2
  if (points.length === 0) return <svg width={w} height={h}/>
  const min = Math.min(...points), max = Math.max(...points)
  const norm = (v) => max === min ? h/2 : h - p - ((v - min) / (max - min)) * (h - p*2)
  const step = (w - p*2) / Math.max(1, points.length - 1)
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${p + i*step} ${norm(v)}`).join(' ')
  return (
    <svg width={w} height={h} className={className} aria-hidden="true">
      <path d={d} fill="none" vectorEffect="non-scaling-stroke" strokeWidth="2" stroke="currentColor" />
    </svg>
  )
}

function ProgressRing({ value = 0, size = 72, stroke = 8 }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const off = c - (clamp(value, 0, 100) / 100) * c
  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} stroke="rgb(226 232 240)" strokeWidth={stroke} fill="none"/>
        <circle
          cx={size/2} cy={size/2} r={r} stroke="rgb(16 185 129)" strokeWidth={stroke}
          fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          transform={`rotate(-90 ${size/2} ${size/2})`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-700">
        {Math.round(value)}%
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tile                                                                */
/* ------------------------------------------------------------------ */
function Tile({ href, emoji, title, value, hint, trend = [] , tone = 'emerald' }) {
  const toneMap = {
    emerald: 'from-emerald-600 to-emerald-500',
    sky: 'from-sky-600 to-sky-500',
    amber: 'from-amber-600 to-amber-500',
    rose: 'from-rose-600 to-rose-500',
  }
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

/* ------------------------------------------------------------------ */
/* Dashboard (wired to backend)                                        */
/* ------------------------------------------------------------------ */
export default function Dashboard() {
  const [range, setRange] = useState('30d') // 7d, 30d, 90d
  const today = new Date()
  const from = useMemo(() => {
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30
    const d = new Date(today); d.setDate(d.getDate() - days + 1); return d
  }, [range])

  // backend data
  const [openInv, setOpenInv] = useState([])
  const [overdueInv, setOverdueInv] = useState([])
  const [paidInv, setPaidInv] = useState([])
  const [allInv, setAllInv] = useState([])
  const [payments, setPayments] = useState([])
  const [bills, setBills] = useState([])
  const [dash, setDash] = useState({ cards: { totalInvoiced: 0, totalOutstanding: 0 }, charts: { invoicedByDay: [] }, topCustomers: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [open, overdue, paid, all, pays, bls, d] = await Promise.all([
          api('/api/invoices?status=Open&limit=500'),
          api('/api/invoices?status=Overdue&limit=500'),
          api('/api/invoices?status=Paid&limit=500'),
          api('/api/invoices?status=All&limit=500'),
          api('/api/payments?limit=500'),
          api('/api/bills?status=All&limit=500'),
          api('/api/dashboard'),
        ])
        if (!alive) return
        setOpenInv(Array.isArray(open) ? open : [])
        setOverdueInv(Array.isArray(overdue) ? overdue : [])
        setPaidInv(Array.isArray(paid) ? paid : [])
        setAllInv(Array.isArray(all) ? all : [])
        setPayments(Array.isArray(pays) ? pays : [])
        setBills(Array.isArray(bls) ? bls : [])
        setDash(d || { cards:{}, charts:{}, topCustomers:[] })
      } catch (e) {
        if (alive) setError(e?.message || 'Failed to load dashboard')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  // filtered by range
  const invInRange = useMemo(
    () => allInv.filter(i => isWithin(toDate(i.date), from, today)),
    [allInv, from]
  )
  const payInRange = useMemo(
    () => payments.filter(p => isWithin(toDate(p.date), from, today)),
    [payments, from]
  )

  // AR KPIs
  const arOpenAmt    = sum(openInv, (i)=>Number(i.total)||0)
  const arOverdueCnt = overdueInv.length
  const overdueAmt   = sum(overdueInv, (i)=>Number(i.total)||0)
  const paidAmt      = sum(paidInv, (i)=>Number(i.total)||0)

  // AP KPIs (bills)
  const apOpenAmt    = sum(bills.filter(b => b.status === 'Open'), (b)=>Number(b.amount)||0)
  const apOverdueCnt = count(bills, (b)=> b.status === 'Overdue')

  // Cash-in (payments)
  const cashIn = sum(payInRange, (p)=> Number(p.amount)||0)

  // Collections rate: paid / (paid + open + overdue)
  const collectible = paidAmt + arOpenAmt + overdueAmt
  const collectionRate = collectible > 0 ? (paidAmt / collectible) * 100 : 0

  // trends (14-day)
  const days = useMemo(() => Array.from({length: 14}, (_,k) => {
    const d = new Date(today); d.setDate(d.getDate() - (13 - k)); return d.toISOString().slice(0,10)
  }), [])
  const trendInvoices = days.map(day => count(allInv, (i) => String(i.date).slice(0,10) === day))
  const trendPayments = days.map(day => sum(payments.filter(p => String(p.date).slice(0,10) === day), p => Number(p.amount)||0))
  const trendBills    = days.map(day => count(bills.filter(b => String(b.date).slice(0,10) === day)))

  // recent lists
  const recentInv  = [...invInRange].sort((a,b)=> new Date(b.date)-new Date(a.date)).slice(0,5)
  const recentPay  = [...payInRange].sort((a,b)=> new Date(b.date)-new Date(a.date)).slice(0,5)

  // upcoming bills (due ≥ today, take earliest 5)
  const upcomingBills = useMemo(() => (
    [...bills]
      .filter(b => toDate(b.due) && toDate(b.due) >= new Date(new Date().toDateString()))
      .sort((a,b)=> new Date(a.due) - new Date(b.due))
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

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          <a href="#/invoices#new" className="rounded-lg bg-emerald-600 text-white text-sm px-3 py-2 hover:bg-emerald-500">+ New Invoice</a>
          <a href="#/payments#new" className="rounded-lg border border-slate-200 bg-white text-sm px-3 py-2 text-slate-700 hover:bg-slate-50">+ Record Payment</a>
          <a href="#/customers#new" className="rounded-lg border border-slate-200 bg-white text-sm px-3 py-2 text-slate-700 hover:bg-slate-50">+ Add Customer</a>
          <a href="#/bills#new" className="rounded-lg border border-slate-200 bg-white text-sm px-3 py-2 text-slate-700 hover:bg-slate-50">+ New Bill</a>
        </div>
      </div>

      {/* KPI Tiles (AR + AP + Cash) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Tile
          href="#/invoices?status=Overdue"
          emoji="📮"
          title="AR Overdue"
          value={loading ? '…' : arOverdueCnt}
          hint="Invoices past due"
          trend={trendInvoices}
          tone="rose"
        />
        <Tile
          href="#/invoices?status=Open"
          emoji="🧾"
          title="AR Open"
          value={loading ? '…' : inr(arOpenAmt)}
          hint="Unpaid invoices"
          trend={trendInvoices}
          tone="amber"
        />
        <Tile
          href="#/bills?status=Overdue"
          emoji="📤"
          title="AP Overdue"
          value={loading ? '…' : apOverdueCnt}
          hint="Bills past due"
          trend={trendBills}
          tone="sky"
        />
        <Tile
          href="#/payments"
          emoji="💸"
          title={`Cash In (${range})`}
          value={loading ? '…' : inr(cashIn)}
          hint="Received payments"
          trend={trendPayments}
          tone="emerald"
        />
      </div>

      {/* Collections + AR/AP snapshots + Top customers */}
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
          <CardBody className="text-xs text-slate-500">
            Improve rate by collecting past-due invoices and offering early-pay discounts.
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Accounts Receivable snapshot" subtitle="Totals by status" />
          <CardBody>
            <ul className="text-sm space-y-2">
              <li className="flex justify-between"><span>Open</span><span className="font-medium">{inr(arOpenAmt)}</span></li>
              <li className="flex justify-between"><span>Overdue</span><span className="font-medium">{inr(overdueAmt)}</span></li>
              <li className="flex justify-between"><span>Paid</span><span className="font-medium">{inr(paidAmt)}</span></li>
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Accounts Payable snapshot" subtitle="Totals by status" />
          <CardBody>
            <ul className="text-sm space-y-2">
              <li className="flex justify-between"><span>Open</span><span className="font-medium">{inr(apOpenAmt)}</span></li>
              <li className="flex justify-between"><span>Overdue</span><span className="font-medium">{inr(sum(bills.filter(b=>b.status==='Overdue'), b=>Number(b.amount)||0))}</span></li>
              <li className="flex justify-between"><span>Paid</span><span className="font-medium">{inr(sum(bills.filter(b=>b.status==='Paid'), b=>Number(b.amount)||0))}</span></li>
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Top customers (90d)" subtitle="By invoiced amount" />
          <CardBody>
            <ul className="text-sm space-y-2">
              {(dash?.topCustomers || []).map((c) => (
                <li key={c._id} className="flex justify-between">
                  <span>{c._id || 'Unknown'}</span>
                  <span className="font-medium">{inr(Number(c.total)||0)}</span>
                </li>
              ))}
              {(!dash?.topCustomers || dash.topCustomers.length === 0) && (
                <div className="text-slate-500">No data</div>
              )}
            </ul>
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
                  {recentInv.length === 0 && (
                    <tr><td colSpan="5" className="p-6 text-center text-slate-500">{loading ? 'Loading…' : 'No invoices'}</td></tr>
                  )}
                  {recentInv.map(r => (
                    <tr key={r._id || r.id || r.number} className="hover:bg-slate-50">
                      <td className="py-3 px-3"><a className="text-sky-700 hover:underline" href={`#/invoices?status=${r.status||'Open'}`}>{r.number}</a></td>
                      <td className="py-3 px-3">{r.customerName}</td>
                      <td className="py-3 px-3 text-right">{inr(Number(r.total)||0)}</td>
                      <td className="py-3 px-3">{dd(r.date)}</td>
                      <td className="py-3 px-3">
                        <span className={
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs border ' +
                          (r.status === 'Paid'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : r.status === 'Overdue'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-sky-50 text-sky-700 border-sky-200')
                        }>
                          {r.status || 'Draft'}
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
                  {recentPay.length === 0 && (
                    <tr><td colSpan="5" className="p-6 text-center text-slate-500">{loading ? 'Loading…' : 'No payments'}</td></tr>
                  )}
                  {recentPay.map(r => (
                    <tr key={r._id || r.id} className="hover:bg-slate-50">
                      <td className="py-3 px-3"><a className="text-sky-700 hover:underline" href="#/payments">{r.id || r._id}</a></td>
                      <td className="py-3 px-3">{r.customer || r.customerName}</td>
                      <td className="py-3 px-3 text-right">{inr(Number(r.amount)||0)}</td>
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
                    <th className="py-3 px-3 text-left">ID</th>
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
                    <tr key={b._id || b.id} className="hover:bg-slate-50">
                      <td className="py-3 px-3"><a className="text-sky-700 hover:underline" href={`#/bills?status=${b.status||'Open'}`}>{b.id || (b._id || '').slice(-6)}</a></td>
                      <td className="py-3 px-3">{b.vendor || b.vendorName}</td>
                      <td className="py-3 px-3">{dd(b.due)}</td>
                      <td className="py-3 px-3 text-right">{inr(Number(b.amount)||0)}</td>
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

      {error && (
        <div className="mt-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
          {error}
        </div>
      )}
    </Page>
  )
}
