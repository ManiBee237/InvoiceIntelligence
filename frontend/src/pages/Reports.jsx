import React, { useEffect, useMemo, useState } from 'react'
import Page from '../components/Page'
import Card, { CardHeader, CardBody, Divider } from '../components/ui/Card'
import { TableWrap, DataTable } from '../components/ui/Table'
import { Btn, BtnGhost } from '../components/ui/Buttons'
import { notify } from '../components/ui/Toast'
import { inr } from '../data/store'
import { api } from '../lib/api'

/* helpers */
const fmtISO = (d) => new Date(d).toISOString().slice(0,10)
function startOfMonth(d=new Date()){ const x=new Date(d); x.setDate(1); return x }
function startOfQuarter(d=new Date()){ const x=new Date(d); const q=Math.floor(x.getMonth()/3)*3; x.setMonth(q,1); return x }
function startOfYear(d=new Date()){ const x=new Date(d); x.setMonth(0,1); return x }

export default function Reports() {
  const today = new Date()
  const [from, setFrom] = useState(startOfMonth(today))
  const [to, setTo] = useState(today)

  // hash presets
  useEffect(() => {
    const apply = () => {
      const parts = window.location.hash.toLowerCase().split('#')
      if (parts.includes('mtd')) { setFrom(startOfMonth(today)); setTo(today) }
      else if (parts.includes('qtd')) { setFrom(startOfQuarter(today)); setTo(today) }
      else if (parts.includes('ytd')) { setFrom(startOfYear(today)); setTo(today) }
      else if (parts.includes('last30')) { const d=new Date(today); d.setDate(d.getDate()-29); setFrom(d); setTo(today) }
    }
    apply()
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [])

  // backend data
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [data, setData] = useState({
    summary: { invoices:{}, payments:{}, ap:{} },
    arAging: [], apAging: [],
    invoices: [], topCustomers: [], recentPayments: []
  })

  async function load() {
    setLoading(true); setErr('')
    try {
      const q = `?from=${encodeURIComponent(fmtISO(from))}&to=${encodeURIComponent(fmtISO(to))}`
      const res = await api(`/api/reports${q}`)
      setData(res || {})
    } catch (e) {
      setErr(e?.message || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [from, to])

  // map
  const invTotalAmt  = +data?.summary?.invoices?.totalAmt || 0
  const invCount     = +data?.summary?.invoices?.count || 0
  const avgInvoice   = +data?.summary?.invoices?.avg || (invCount ? Math.round(invTotalAmt/invCount) : 0)
  const gstCollected = +data?.summary?.invoices?.gstCollected || 0

  const payAmt   = +data?.summary?.payments?.totalAmt || 0
  const payCount = +data?.summary?.payments?.count || 0

  const apOpenAmt    = +data?.summary?.ap?.openAmt || 0
  const apOverdueAmt = +data?.summary?.ap?.overdueAmt || 0

  const arAgingRows = data?.arAging || []
  const apAgingRows = data?.apAging || []

  const invInRange = data?.invoices || []
  const topCustomers = data?.topCustomers || []
  const recentPayments = data?.recentPayments || []

  /* csv util */
  const exportCSV = (rows, filename='report.csv') => {
    if (!rows || !rows.length) { notify.info('Nothing to export'); return }
    const headers = Object.keys(rows[0])
    const escape = (v) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [headers.join(',')]
      .concat(rows.map(r => headers.map(h => escape(r[h])).join(','))).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
    notify.success('Export ready', filename)
  }

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
      {/* Filters */}
      <Card>
        <CardHeader title="Filters" subtitle="Choose a date range for all sections" />
        <CardBody>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <div className="text-xs text-slate-600 mb-1">From</div>
              <input type="date" className="w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                value={fmtISO(from)} onChange={(e)=>setFrom(new Date(e.target.value))}/>
            </label>
            <label className="block">
              <div className="text-xs text-slate-600 mb-1">To</div>
              <input type="date" className="w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                value={fmtISO(to)} onChange={(e)=>setTo(new Date(e.target.value))}/>
            </label>
            <div className="grow" />
            <div className="flex gap-2">
              <BtnGhost onClick={load}>{loading ? 'Loading…' : 'Refresh'}</BtnGhost>
              <BtnGhost onClick={() => window.print()}>Print</BtnGhost>
            </div>
          </div>
          {err && <div className="mt-2 text-sm text-rose-700">{err}</div>}
        </CardBody>
      </Card>

      {/* Summary tiles */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Tile title="Sales (Invoices)" value={inr(invTotalAmt)} hint={`${invCount} invoices • avg ${inr(avgInvoice)}`} tone="emerald" />
        <Tile title="Payments received" value={inr(payAmt)} hint={`${payCount} payments`} tone="sky" />
        <Tile title="GST collected" value={inr(gstCollected)} hint="Within selected range" tone="amber" />
        <Tile title="A/P open + overdue" value={inr(apOpenAmt + apOverdueAmt)} hint={`Open ${inr(apOpenAmt)} • Overdue ${inr(apOverdueAmt)}`} tone="rose" />
      </div>

      {/* Aging */}
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
                  <tr><th className="py-3 px-3 text-left">Bucket</th><th className="py-3 px-3 text-right">Amount</th></tr>
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
                  <tr><th className="py-3 px-3 text-left">Bucket</th><th className="py-3 px-3 text-right">Amount</th></tr>
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

      {/* Sales / Top customers */}
      <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader
            title="Invoices in range"
            subtitle={`${fmtISO(from)} → ${fmtISO(to)}`}
            actions={
              <BtnGhost onClick={()=>{
                const rows = invInRange.map(i => ({
                  number: i.number, customer: i.customerName,
                  date: fmtISO(new Date(i.date)), dueDate: i.dueDate ? fmtISO(new Date(i.dueDate)) : '',
                  status: i.status, total: +i.total || 0
                }))
                exportCSV(rows, `invoices-${fmtISO(from)}-to-${fmtISO(to)}.csv`)
              }}>Export CSV</BtnGhost>
            }
          />
          <CardBody>
            <TableWrap>
              <DataTable
                empty={loading ? 'Loading…' : 'No invoices'}
                initialSort={{ key: 'date', dir: 'desc' }}
                columns={[
                  { key: 'number', header: '#'},
                  { key: 'customerName', header: 'Customer' },
                  { key: 'date', header: 'Date' },
                  { key: 'status', header: 'Status' },
                  { key: 'total', header: 'Amount', align: 'right', render: (r)=>inr(+r.total||0) },
                ]}
                rows={invInRange}
              />
            </TableWrap>
          </CardBody>
        </Card>

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
                  <tr><th className="py-3 px-3 text-left">Customer</th><th className="py-3 px-3 text-right">Total</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(!topCustomers || topCustomers.length === 0) && (
                    <tr><td colSpan="2" className="p-6 text-center text-slate-500">{loading ? 'Loading…' : 'No data'}</td></tr>
                  )}
                  {topCustomers.map(r => (
                    <tr key={r.customer} className="hover:bg-slate-50">
                      <td className="py-3 px-3">{r.customer}</td>
                      <td className="py-3 px-3 text-right">{inr(+r.total||0)}</td>
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
                const rows = (recentPayments||[]).map(p => ({
                  id: p.id, date: fmtISO(new Date(p.date)), customer: p.customer,
                  invoice: p.invoice, method: p.method, amount: +p.amount || 0
                }))
                exportCSV(rows, `payments-${fmtISO(from)}-to-${fmtISO(to)}.csv`)
              }}>Export CSV</BtnGhost>
            }
          />
          <CardBody>
            <TableWrap>
              <DataTable
                empty={loading ? 'Loading…' : 'No payments'}
                initialSort={{ key: 'date', dir: 'desc' }}
                columns={[
                  { key: 'id', header: 'ID' },
                  { key: 'date', header: 'Date' },
                  { key: 'customer', header: 'Customer' },
                  { key: 'invoice', header: 'Invoice #' },
                  { key: 'method', header: 'Method' },
                  { key: 'amount', header: 'Amount', align: 'right', render: (r)=>inr(+r.amount||0) },
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

/* small UI */
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
