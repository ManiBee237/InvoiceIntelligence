import React, { useEffect, useMemo, useState } from 'react'
import Page from '../../components/Page'
import Card, { CardHeader, CardBody } from '../../components/ui/Card'
import { TableWrap, DataTable } from '../../components/ui/Table'
import { Btn, BtnGhost } from '../../components/ui/Buttons'
import { notify } from '../../components/ui/Toast'
import { inr, dd } from '../../data/store'
import { api } from '../../lib/api'

/* ------------------------------- component ------------------------------- */
export default function MLForecast() {
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

  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [resp, setResp] = useState({
    dailyRows: [],
    total: 0,
    detail: [],
    topPayers: [],
    learned: { overallAvg: 0, perCustomerAvg: {} }
  })

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true); setErr('')
      try {
        const q = new URLSearchParams({
          horizonDays: String(opts.horizonDays),
          defaultTerms: String(opts.defaultTerms),
          multMedium: String(opts.multMedium),
          multHigh: String(opts.multHigh),
          multCritical: String(opts.multCritical),
          collectionPush: String(opts.collectionPush),
          spreadDays: String(opts.spreadDays),
          spreadShape: String(opts.spreadShape),
          discountPercent: String(opts.discountPercent),
          discountUptake: String(opts.discountUptake),
          discountPullForwardDays: String(opts.discountPullForwardDays),
        })
        const data = await api(`/api/ml/forecast?${q.toString()}`)
        if (!alive) return
        setResp(data || { dailyRows: [], total: 0, detail: [], topPayers: [], learned: { overallAvg: 0, perCustomerAvg: {} } })
      } catch (e) {
        if (alive) setErr(e?.message || 'Failed to load forecast')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [opts])

  const { dailyRows, total, detail, topPayers, learned } = resp
  const unpaidCount = useMemo(
    () => (detail?.length ? new Set(detail.map(d => d.number)).size : 0),
    [detail]
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
            <b>Learned from history:</b> Avg delay overall <b>{pluralDay(resp?.learned?.overallAvg || 0)}</b>
            {Object.keys(resp?.learned?.perCustomerAvg||{}).length > 0 && <> • per-customer applied when available</>}
          </div>

          {err && <div className="mt-2 text-sm text-rose-700">{err}</div>}
        </CardBody>
      </Card>

      {/* Tiles */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <Tile tone="emerald" title="Forecast total" value={inr(total)} hint={`Next ${opts.horizonDays} days`} />
        <Tile tone="sky" title="Days with cash-in" value={dailyRows.filter(d=>d.amount>0).length} hint="Non-zero days" />
        <Tile tone="amber" title="Avg / active day" value={inr(avgNonZero(dailyRows))} hint="Across non-zero days" />
        <Tile tone="rose" title="Unpaid invoices" value={unpaidCount} />
      </div>

      {/* Forecast schedule & Top payers */}
      <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Daily schedule" subtitle="Projected receipts per day (probabilistic)" />
          <CardBody>
            <TableWrap>
              <DataTable
                empty={loading ? 'Loading…' : 'No projected cash'}
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
                    <tr><td colSpan="5" className="p-6 text-center text-slate-500">{loading ? 'Loading…' : 'No candidates'}</td></tr>
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
