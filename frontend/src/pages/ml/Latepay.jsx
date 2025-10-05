// src/pages/ml/Latepay.jsx
import React, { useEffect, useMemo, useState } from 'react'
import Page from '../../components/Page'
import Card, { CardHeader, CardBody } from '../../components/ui/Card'
import { TableWrap, DataTable } from '../../components/ui/Table'
import { Btn, BtnGhost } from '../../components/ui/Buttons'
import SweetAlert from '../../components/ui/SweetAlert'
import { notify } from '../../components/ui/Toast'
import { data as store, inr, dd } from '../../data/store'

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */
const TODAY = () => new Date()
const toDate = (d) => (d ? new Date(d) : null)
const atMidnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const diffDays = (a, b) => {
  if (!a || !b) return 0
  const A = atMidnight(a), B = atMidnight(b)
  return Math.floor((B - A) / (24*60*60*1000))
}
const clamp = (n, a, b) => Math.max(a, Math.min(b, n))

// Risk band
function bandFromScore(score){
  if (score >= 80) return 'Critical'
  if (score >= 60) return 'High'
  if (score >= 35) return 'Medium'
  return 'Low'
}
function bandTone(b){
  return b === 'Critical' ? 'rose'
       : b === 'High'     ? 'amber'
       : b === 'Medium'   ? 'sky'
       : 'emerald'
}
function Badge({ label, tone }) {
  const map = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    sky: 'bg-sky-50 text-sky-700 border-sky-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
  }
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs border ${map[tone]}`}>{label}</span>
}

// Simple heuristic late-pay score (0–100). Tweak weights as needed.
function scoreInvoice(inv, peerStats) {
  const today = TODAY()
  const due = toDate(inv.dueDate || inv.due)
  const issue = toDate(inv.date)
  const amount = Number(inv.total) || 0
  const isOverdue = !!due && diffDays(due, today) > 0
  const daysPastDue = isOverdue ? diffDays(due, today) : 0
  const daysToDue = !isOverdue && due ? diffDays(today, due) : 9999

  // Peer history for this customer
  const hist = peerStats[inv.customerName] || { overdues: 0, paidLate: 0, count: 0, avgDaysPast: 0 }

  // Features → points
  let pts = 0
  // 1) Overdue severity
  pts += clamp(daysPastDue * 1.2, 0, 40)         // up to 40 pts for being overdue longer
  // 2) Approaching due date
  if (!isOverdue && daysToDue <= 7) pts += clamp((7 - daysToDue) * 2.0, 0, 12) // up to 12 pts
  // 3) High amount
  const amtTier = amount <= 0 ? 0 : amount < 10000 ? 4 : amount < 50000 ? 8 : 12
  pts += amtTier
  // 4) Customer history
  pts += clamp(hist.overdues * 4, 0, 16)         // each past overdue adds risk
  pts += clamp(hist.avgDaysPast * 0.3, 0, 12)    // average lateness historically
  // 5) Missing contact info (if present on invoice object)
  if (!inv.customerEmail && !inv.customerPhone) pts += 4

  // status nudges
  if (inv.status === 'Overdue') pts += 6
  if (inv.status === 'Open' && due && diffDays(today, due) >= -3) pts += 3 // almost due

  return clamp(Math.round(pts), 0, 100)
}

// Collect peer stats per customer from store history
function buildPeerStats(invoices) {
  const m = {}
  invoices.forEach(i => {
    const name = i.customerName || '—'
    if (!m[name]) m[name] = { overdues: 0, paidLate: 0, sumDaysPast: 0, count: 0, avgDaysPast: 0 }
    const due = toDate(i.dueDate || i.due)
    const days = due ? diffDays(due, TODAY()) : 0
    const wasOver = i.status === 'Overdue' || (due && days > 0 && i.status !== 'Paid')
    if (wasOver) m[name].overdues += 1
    // if you track payment date on invoice later, compute paidLate
    m[name].sumDaysPast += Math.max(0, days)
    m[name].count += 1
  })
  Object.keys(m).forEach(k => {
    const v = m[k]
    v.avgDaysPast = v.count ? Math.round(v.sumDaysPast / v.count) : 0
  })
  return m
}

/* -------------------------------------------------------------------------- */
/* Build rows                                                                  */
/* -------------------------------------------------------------------------- */
function buildRows() {
  const all = (store.invoices || [])
  const peers = buildPeerStats(all)

  // consider only unpaid (Open/Overdue)
  return all
    .filter(i => i.status !== 'Paid')
    .map(i => {
      const s = scoreInvoice(i, peers)
      const b = bandFromScore(s)
      return {
        id: i.id || i._id || i.number,
        number: i.number,
        date: i.date,
        due: i.dueDate || i.due,
        customer: i.customerName || '—',
        amount: Number(i.total) || 0,
        status: i.status || 'Open',
        riskScore: s,
        riskBand: b,
        promiseDate: i.promiseDate || '',      // custom field we’ll persist
        lastReminded: i.lastReminded || '',    // custom field we’ll persist
        _ref: i,
      }
    })
    .sort((a,b)=> b.riskScore - a.riskScore) // highest risk first
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */
export default function MLLatepay() {
  const [rows, setRows] = useState(buildRows)
  const [q, setQ] = useState('')
  const [band, setBand] = useState('All')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [target, setTarget] = useState(null) // row for promise date
  const [promiseDate, setPromiseDate] = useState('')

  // refresh list when navigating back
  useEffect(() => {
    const onHash = () => setRows(buildRows())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // read ?band=High from hash
  useEffect(() => {
    const syncFromHash = () => {
      const qstr = (window.location.hash.split('?')[1] || '')
      const params = new URLSearchParams(qstr)
      const b = params.get('band')
      if (b && ['All','Low','Medium','High','Critical'].includes(b)) setBand(b)
    }
    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [])

  const filtered = useMemo(() => {
    let list = rows
    if (band !== 'All') list = list.filter(r => r.riskBand === band)
    if (q.trim()) {
      const s = q.toLowerCase()
      list = list.filter(r =>
        String(r.number || '').toLowerCase().includes(s) ||
        String(r.customer || '').toLowerCase().includes(s)
      )
    }
    return list
  }, [rows, band, q])

  /* ----------------------------- Actions ---------------------------------- */
  const sendReminder = (r) => {
    // Here you’d hit your backend to send an email/SMS. For now we persist lastReminded.
    r._ref.lastReminded = new Date().toISOString().slice(0,10)
    notify.success('Reminder sent', `${r.customer} • ${r.number}`)
    setRows(buildRows()) // refresh computed values if needed
  }

  const openPromise = (r) => {
    setTarget(r)
    setPromiseDate(r.promiseDate || new Date().toISOString().slice(0,10))
    setConfirmOpen(true)
  }
  const confirmPromise = () => {
    if (!target) return
    target._ref.promiseDate = promiseDate
    notify.info('Promise recorded', `${target.customer} • ${dd(promiseDate)}`)
    setConfirmOpen(false); setTarget(null)
    setRows(buildRows())
  }

  const bulkRemind = () => {
    const top = filtered.slice(0, 10) // be nice; cap to first 10 visible
    top.forEach(sendReminder)
    notify.info('Reminders queued', `${top.length} customer(s)`)
  }

  const exportCSV = () => {
    if (!filtered.length) { notify.info('Nothing to export'); return }
    const headers = ['number','customer','date','due','status','amount','riskScore','riskBand','promiseDate','lastReminded']
    const esc = (v)=> {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s
    }
    const csv = [headers.join(',')].concat(
      filtered.map(r => headers.map(h => esc(r[h])).join(','))
    ).join('\n')
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download='late-pay-risk.csv'
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
    notify.success('Export ready', 'late-pay-risk.csv')
  }

  /* ---------------------------------- UI ---------------------------------- */
  // Summary bands
  const counts = useMemo(() => {
    const c = { All: rows.length, Low:0, Medium:0, High:0, Critical:0 }
    rows.forEach(r => c[r.riskBand] += 1)
    return c
  }, [rows])

  return (
    <Page
      title="Late Pay Risk"
      subtitle="Prioritize follow-ups with a simple risk score for each unpaid invoice."
      actions={
        <div className="flex gap-2">
          <BtnGhost onClick={exportCSV}>Export CSV</BtnGhost>
          <Btn onClick={bulkRemind}>Remind top 10 visible</Btn>
        </div>
      }
    >
      {/* Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Tile title="All" value={counts.All} tone="emerald" href="#/ml/latepay?band=All" />
        <Tile title="Low" value={counts.Low} tone="emerald" href="#/ml/latepay?band=Low" />
        <Tile title="Medium" value={counts.Medium} tone="sky" href="#/ml/latepay?band=Medium" />
        <Tile title="High" value={counts.High} tone="amber" href="#/ml/latepay?band=High" />
        <Tile title="Critical" value={counts.Critical} tone="rose" href="#/ml/latepay?band=Critical" />
      </div>

      {/* Filters */}
      <Card className="mt-4">
        <CardHeader title="Filters" subtitle="Search and narrow by risk band" />
        <CardBody>
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder="Search invoice # or customer"
              value={q}
              onChange={(e)=>setQ(e.target.value)}
            />
            <select
              className="w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
              value={band}
              onChange={(e)=>setBand(e.target.value)}
            >
              {['All','Low','Medium','High','Critical'].map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </CardBody>
      </Card>

      {/* Table */}
      <div className="mt-4">
        <TableWrap>
          <DataTable
            empty="No unpaid invoices"
            initialSort={{ key: 'riskScore', dir: 'desc' }}
            columns={[
              { key: 'number', header: '#'},
              { key: 'customer', header: 'Customer' },
              { key: 'amount', header: 'Amount', align: 'right', render: (r)=>inr(r.amount) },
              { key: 'date', header: 'Date', render: (r)=>dd(r.date) },
              { key: 'due', header: 'Due', render: (r)=>dd(r.due) },
              {
                key: 'status', header: 'Status',
                render: (r)=>(
                  <Badge
                    label={r.status}
                    tone={r.status==='Overdue' ? 'rose' : 'amber'}
                  />
                )
              },
              {
                key: 'risk', header: 'Risk',
                render: (r)=>(
                  <div className="flex items-center gap-2">
                    <Badge label={r.riskBand} tone={bandTone(r.riskBand)} />
                    <span className="text-sm text-slate-700">{r.riskScore}</span>
                  </div>
                )
              },
              {
                key: 'promiseDate', header: 'Promise',
                render: (r)=> r.promiseDate ? dd(r.promiseDate) : <span className="text-slate-400">—</span>
              },
              {
                key: 'lastReminded', header: 'Reminded',
                render: (r)=> r.lastReminded ? dd(r.lastReminded) : <span className="text-slate-400">—</span>
              },
              {
                key: '_actions', header: 'Actions', align: 'right',
                render: (r)=>(
                  <div className="flex justify-end gap-2">
                    <BtnGhost onClick={()=>sendReminder(r)}>Send reminder</BtnGhost>
                    <Btn onClick={()=>openPromise(r)}>Set promise</Btn>
                  </div>
                )
              },
            ]}
            rows={filtered}
          />
        </TableWrap>
      </div>

      {/* Promise date modal */}
      <SweetAlert
        open={!!confirmOpen}
        title="Set promise to pay"
        message={target ? `Invoice ${target.number} — ${target.customer}` : ''}
        confirmText="Save"
        cancelText="Cancel"
        tone="emerald"
        onConfirm={confirmPromise}
        onCancel={()=>{ setConfirmOpen(false); setTarget(null) }}
      >
        <label className="block">
          <div className="text-xs text-slate-600 mb-1">Promise date</div>
          <input
            type="date"
            className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
            value={promiseDate}
            onChange={(e)=>setPromiseDate(e.target.value)}
          />
        </label>
      </SweetAlert>
    </Page>
  )
}

/* -------------------------------------------------------------------------- */
/* Small UI bits                                                               */
/* -------------------------------------------------------------------------- */
function Tile({ title, value, tone='emerald', href='#' }) {
  const tones = {
    emerald: 'from-emerald-600 to-emerald-500',
    sky: 'from-sky-600 to-sky-500',
    amber: 'from-amber-600 to-amber-500',
    rose: 'from-rose-600 to-rose-500',
  }
  return (
    <a href={href} className="block rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-400">
      <div className="rounded-2xl p-[1px] bg-gradient-to-br from-slate-200 via-white to-slate-200 shadow-[0_6px_28px_rgba(15,23,42,.08)]">
        <div className="rounded-2xl bg-white">
          <div className={`px-4 py-3 rounded-t-2xl text-white bg-gradient-to-br ${tones[tone]}`}>
            <div className="text-[13px] font-medium opacity-95">{title}</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[22px] font-semibold text-slate-900">{value}</div>
          </div>
        </div>
      </div>
    </a>
  )
}
