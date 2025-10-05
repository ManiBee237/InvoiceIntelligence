// src/pages/Reports.jsx
import React, { useEffect, useMemo, useState } from 'react'
import Page from '../components/Page'
import Card, { CardHeader, CardBody, Divider } from '../components/ui/Card'
import { TableWrap, DataTable } from '../components/ui/Table'
import { Btn, BtnGhost } from '../components/ui/Buttons'
import { notify } from '../components/ui/Toast'
import { data as store, inr } from '../data/store'

/* ------------------------------- helpers -------------------------------- */
const toDate = (d) => (d ? new Date(d) : null)
const sameDay = (a, b) => a && b && a.toISOString().slice(0,10) === b.toISOString().slice(0,10)
const fmtISO = (d) => d.toISOString().slice(0,10)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const sum = (arr, f = (x) => x) => arr.reduce((acc, x) => acc + (f(x) || 0), 0)

function startOfMonth(d=new Date()){ const x=new Date(d); x.setDate(1); return x }
function startOfQuarter(d=new Date()){
  const x=new Date(d); const q=Math.floor(x.getMonth()/3)*3; x.setMonth(q,1); return x
}
function startOfYear(d=new Date()){ const x=new Date(d); x.setMonth(0,1); return x }

function within(d, from, to) { return !!d && d >= from && d <= to }

function gstPortion(inv) {
  // Prefer explicit fields
  const up = Number(inv.unitPrice) || 0
  const qty = Number(inv.qty) || 0
  const gst = Number(inv.gst) || 0
  if (up && qty && gst >= 0) return Math.round(up * qty * (gst/100))
  // Fallback: if total & gst present but no unit/qty
  const total = Number(inv.total) || 0
  if (total && gst) return Math.round(total - (total / (1 + gst/100)))
  return 0
}

function agingBucket(days) {
  if (days <= 30) return '0–30'
  if (days <= 60) return '31–60'
  if (days <= 90) return '61–90'
  return '90+'
}

function daysBetween(a, b) {
  const ms = 24*60*60*1000
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.floor((end - start) / ms)
}

/* CSV export (array of objects) */
function exportCSV(rows, filename='report.csv') {
  if (!rows || rows.length === 0) {
    notify.info('Nothing to export', 'No rows in this table'); 
    return
  }
  const headers = Object.keys(rows[0])
  const escape = (v) => {
    const s = String(v ?? '')
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const csv = [headers.join(',')]
    .concat(rows.map(r => headers.map(h => escape(r[h])).join(',')))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  notify.success('Export ready', filename ? `Saved: ${filename}` : 'CSV downloaded')
}

/* ------------------------------- component ------------------------------- */
export default function Reports() {
  const today = new Date()

  /* -------- range state + hash presets -------- */
  const [from, setFrom] = useState(startOfMonth(today))
  const [to, setTo] = useState(today)

  useEffect(() => {
    const applyHashPreset = () => {
      const parts = window.location.hash.toLowerCase().split('#')
      if (parts.includes('mtd')) { setFrom(startOfMonth(today)); setTo(today) }
      else if (parts.includes('qtd')) { setFrom(startOfQuarter(today)); setTo(today) }
      else if (parts.includes('ytd')) { setFrom(startOfYear(today)); setTo(today) }
      else if (parts.includes('last30')) { const d=new Date(today); d.setDate(d.getDate()-29); setFrom(d); setTo(today) }
    }
    applyHashPreset()
    window.addEventListener('hashchange', applyHashPreset)
    return () => window.removeEventListener('hashchange', applyHashPreset)
  }, [])

  /* -------- source data -------- */
  const invoices = store.invoices || []
  const payments = store.payments || []
  const bills    = store.bills || []

  /* -------- filter by date range -------- */
  const invInRange = useMemo(() => invoices.filter(i => within(toDate(i.date), from, to)), [invoices, from, to])
  const payInRange = useMemo(() => payments.filter(p => within(toDate(p.date), from, to)), [payments, from, to])
  const billInRange= useMemo(() => bills.filter(b => within(toDate(b.date), from, to)), [bills, from, to])

  /* -------- summaries -------- */
  const invTotalAmt   = sum(invInRange, (i)=>Number(i.total)||0)
  const invCount      = invInRange.length
  const avgInvoice    = invCount ? Math.round(invTotalAmt / invCount) : 0
  const gstCollected  = sum(invInRange, gstPortion)

  const payAmt        = sum(payInRange, (p)=>Number(p.amount)||0)
  const payCount      = payInRange.length

  const apOpenAmt     = sum(billInRange.filter(b=>b.status==='Open'), (b)=>Number(b.amount)||0)
  const apOverdueAmt  = sum(billInRange.filter(b=>b.status==='Overdue'), (b)=>Number(b.amount)||0)

/* -------- AR Aging (Invoices) -------- */
const arAgingMap = { '0–30':0, '31–60':0, '61–90':0, '90+':0 }
invoices.forEach(i => {
  // unpaid = Open or Overdue (ignore Paid)
  if (i.status === 'Paid') return
  const issue = toDate(i.date)
  const due = fallbackDue(issue, toDate(i.dueDate || i.due))
  const amt = Number(i.total) || 0
  if (!due || !amt) return

  const diff = daysBetween(due, new Date()) // how many days past due
  if (diff <= 0) return // not overdue

  const bucket = diff <= 30 ? '0–30' : diff <= 60 ? '31–60' : diff <= 90 ? '61–90' : '90+'
  arAgingMap[bucket] += amt
})
const arAgingRows = Object.entries(arAgingMap).map(([bucket, amount]) => ({ bucket, amount }))

function atMidnight(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function daysBetween(a, b) { // b - a, in whole days
  const A = atMidnight(a), B = atMidnight(b)
  return Math.floor((B - A) / (24*60*60*1000))
}

const DEFAULT_TERMS_DAYS = 30
function fallbackDue(issue, explicitDue) {
  if (explicitDue) return explicitDue
  if (!issue) return null
  const d = new Date(issue)
  d.setDate(d.getDate() + DEFAULT_TERMS_DAYS)
  return d
}

  /* -------- AP Aging (Bills) -------- */
 const apAgingMap = { '0–30':0, '31–60':0, '61–90':0, '90+':0 }
bills.forEach(b => {
  if (b.status === 'Paid') return
  const issue = toDate(b.date)
  const due = fallbackDue(issue, toDate(b.due))
  const amt = Number(b.amount) || 0
  if (!due || !amt) return

  const diff = daysBetween(due, new Date())
  if (diff <= 0) return

  const bucket = diff <= 30 ? '0–30' : diff <= 60 ? '31–60' : diff <= 90 ? '61–90' : '90+'
  apAgingMap[bucket] += amt
})
const apAgingRows = Object.entries(apAgingMap).map(([bucket, amount]) => ({ bucket, amount }))


  /* -------- Top customers by revenue -------- */
  const byCustomer = {}
  invInRange.forEach(i => {
    const name = i.customerName || '—'
    byCustomer[name] = (byCustomer[name] || 0) + (Number(i.total) || 0)
  })
  const topCustomers = Object.entries(byCustomer)
    .map(([customer, total]) => ({ customer, total }))
    .sort((a,b)=>b.total-a.total)
    .slice(0,10)

  /* -------- payments list (recent) -------- */
  const recentPayments = [...payInRange]
    .sort((a,b)=> new Date(b.date) - new Date(a.date))
    .slice(0,10)

  /* ------------------------------- UI ------------------------------------ */
  return (
    <Page
      title="Reports"
      subtitle="Business summary, aging, and exports"
      actions={
        <div className="flex gap-2">
          <BtnGhost onClick={()=>{ window.location.hash = '#/reports#mtd' }}>MTD</BtnGhost>
          <BtnGhost onClick={()=>{ window.location.hash = '#/reports#qtd' }}>QTD</BtnGhost>
          <BtnGhost onClick={()=>{ window.location.hash = '#/reports#ytd' }}>YTD</BtnGhost>
          <BtnGhost onClick={()=>{ window.location.hash = '#/reports#last30' }}>Last 30</BtnGhost>
        </div>
      }
    >
      {/* Range selector */}
      <Card>
        <CardHeader title="Filters" subtitle="Choose a date range for all sections" />
        <CardBody>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <div className="text-xs text-slate-600 mb-1">From</div>
              <input
                type="date"
                className="w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                value={fmtISO(from)}
                onChange={(e)=>setFrom(new Date(e.target.value))}
              />
            </label>
            <label className="block">
              <div className="text-xs text-slate-600 mb-1">To</div>
              <input
                type="date"
                className="w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                value={fmtISO(to)}
                onChange={(e)=>setTo(new Date(e.target.value))}
              />
            </label>
            <div className="grow" />
            <div className="flex gap-2">
              <BtnGhost onClick={() => { window.print(); }}>Print</BtnGhost>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Summary tiles */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Tile title="Sales (Invoices)" value={inr(invTotalAmt)} hint={`${invCount} invoices • avg ${inr(avgInvoice)}`} tone="emerald" />
        <Tile title="Payments received" value={inr(payAmt)} hint={`${payCount} payments`} tone="sky" />
        <Tile title="GST collected" value={inr(gstCollected)} hint="Within selected range" tone="amber" />
        <Tile title="A/P open + overdue" value={inr(apOpenAmt + apOverdueAmt)} hint={`Open ${inr(apOpenAmt)} • Overdue ${inr(apOverdueAmt)}`} tone="rose" />
      </div>

      {/* AR Aging */}
      <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader
            title="A/R Aging (Receivables)"
            subtitle="Past-due invoices bucketed by days overdue"
            actions={<BtnGhost onClick={()=>exportCSV(arAgingRows, `ar-aging-${fmtISO(from)}-to-${fmtISO(to)}.csv`)}>Export CSV</BtnGhost>}
          />
          <CardBody>
            <TableWrap>
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur text-slate-600">
                  <tr>
                    <th className="py-3 px-3 text-left">Bucket</th>
                    <th className="py-3 px-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {arAgingRows.map(r => (
                    <tr key={r.bucket} className="hover:bg-slate-50">
                      <td className="py-3 px-3">{r.bucket}</td>
                      <td className="py-3 px-3 text-right">{inr(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </CardBody>
        </Card>

        {/* AP Aging */}
        <Card>
          <CardHeader
            title="A/P Aging (Payables)"
            subtitle="Past-due bills bucketed by days overdue"
            actions={<BtnGhost onClick={()=>exportCSV(apAgingRows, `ap-aging-${fmtISO(from)}-to-${fmtISO(to)}.csv`)}>Export CSV</BtnGhost>}
          />
          <CardBody>
            <TableWrap>
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur text-slate-600">
                  <tr>
                    <th className="py-3 px-3 text-left">Bucket</th>
                    <th className="py-3 px-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {apAgingRows.map(r => (
                    <tr key={r.bucket} className="hover:bg-slate-50">
                      <td className="py-3 px-3">{r.bucket}</td>
                      <td className="py-3 px-3 text-right">{inr(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </CardBody>
        </Card>
      </div>

      {/* Sales & Top customers & Payments list */}
      <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Sales detail (Invoices in range) */}
        <Card>
          <CardHeader
            title="Invoices in range"
            subtitle={`${fmtISO(from)} → ${fmtISO(to)}`}
            actions={
              <BtnGhost onClick={()=>{
                const rows = invInRange.map(i => ({
                  number: i.number, customer: i.customerName,
                  date: i.date, dueDate: i.dueDate || '',
                  status: i.status, total: Number(i.total)||0, gst: gstPortion(i)
                }))
                exportCSV(rows, `invoices-${fmtISO(from)}-to-${fmtISO(to)}.csv`)
              }}>Export CSV</BtnGhost>
            }
          />
          <CardBody>
            <TableWrap>
              <DataTable
                empty="No invoices"
                initialSort={{ key: 'date', dir: 'desc' }}
                columns={[
                  { key: 'number', header: '#'},
                  { key: 'customerName', header: 'Customer' },
                  { key: 'date', header: 'Date' },
                  { key: 'status', header: 'Status' },
                  { key: 'total', header: 'Amount', align: 'right', render: (r)=>inr(Number(r.total)||0) },
                ]}
                rows={invInRange}
              />
            </TableWrap>
          </CardBody>
        </Card>

        {/* Top customers */}
        <Card>
          <CardHeader
            title="Top customers"
            subtitle="By invoice amount within range (Top 10)"
            actions={<BtnGhost onClick={()=>exportCSV(topCustomers, `top-customers-${fmtISO(from)}-to-${fmtISO(to)}.csv`)}>Export CSV</BtnGhost>}
          />
          <CardBody>
            <TableWrap>
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur text-slate-600">
                  <tr>
                    <th className="py-3 px-3 text-left">Customer</th>
                    <th className="py-3 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topCustomers.length === 0 && (
                    <tr><td colSpan="2" className="p-6 text-center text-slate-500">No data</td></tr>
                  )}
                  {topCustomers.map(r => (
                    <tr key={r.customer} className="hover:bg-slate-50">
                      <td className="py-3 px-3">{r.customer}</td>
                      <td className="py-3 px-3 text-right">{inr(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </CardBody>
        </Card>
      </div>

      {/* Recent Payments */}
      <div className="mt-4">
        <Card>
          <CardHeader
            title="Recent payments"
            subtitle={`${fmtISO(from)} → ${fmtISO(to)} (latest 10)`}
            actions={
              <BtnGhost onClick={()=>{
                const rows = recentPayments.map(p => ({
                  id: p.id, date: p.date, customer: p.customer,
                  invoice: p.invoice, method: p.method, amount: Number(p.amount)||0
                }))
                exportCSV(rows, `payments-${fmtISO(from)}-to-${fmtISO(to)}.csv`)
              }}>Export CSV</BtnGhost>
            }
          />
          <CardBody>
            <TableWrap>
              <DataTable
                empty="No payments"
                initialSort={{ key: 'date', dir: 'desc' }}
                columns={[
                  { key: 'id', header: 'ID' },
                  { key: 'date', header: 'Date' },
                  { key: 'customer', header: 'Customer' },
                  { key: 'invoice', header: 'Invoice #' },
                  { key: 'method', header: 'Method' },
                  { key: 'amount', header: 'Amount', align: 'right', render: (r)=>inr(Number(r.amount)||0) },
                ]}
                rows={recentPayments}
              />
            </TableWrap>
          </CardBody>
        </Card>
      </div>
    </Page>
  )
}

/* ------------------------------- small UI ------------------------------- */
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
