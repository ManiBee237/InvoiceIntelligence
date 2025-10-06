// src/pages/ml/Latepay.jsx
import React, { useEffect, useMemo, useState } from 'react'
import Page from '../../components/Page'
import Card, { CardHeader, CardBody } from '../../components/ui/Card'
import { TableWrap, DataTable } from '../../components/ui/Table'
import { Btn, BtnGhost } from '../../components/ui/Buttons'
import SweetAlert from '../../components/ui/SweetAlert'
import { notify } from '../../components/ui/Toast'
import { inr, dd } from '../../data/store'
import { api } from '../../lib/api'

/* UI helpers */
function bandTone(b){ return b==='Critical'?'rose' : b==='High'?'amber' : b==='Medium'?'sky' : 'emerald' }
function Badge({ label, tone }) {
  const map = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    sky: 'bg-sky-50 text-sky-700 border-sky-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
  }
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs border ${map[tone]}`}>{label}</span>
}

/* Component */
export default function MLLatepay() {
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({ All:0, Low:0, Medium:0, High:0, Critical:0 })
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const [q, setQ] = useState('')
  const [band, setBand] = useState('All')

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [target, setTarget] = useState(null)
  const [promiseDate, setPromiseDate] = useState('')

  const load = async () => {
    setLoading(true); setErr('')
    try {
      const res = await api('/api/ml/latepay')
      setRows(Array.isArray(res?.rows) ? res.rows : [])
      setCounts(res?.counts || { All:0, Low:0, Medium:0, High:0, Critical:0 })
    } catch (e) {
      setErr(e?.message || 'Failed to load'); setRows([]); setCounts({ All:0, Low:0, Medium:0, High:0, Critical:0 })
    } finally {
      setLoading(false)
    }
  }

  // initial + on hash change (to keep parity with your old pattern)
  useEffect(() => {
    const sync = () => {
      const qstr = (window.location.hash.split('?')[1] || '')
      const params = new URLSearchParams(qstr)
      const b = params.get('band')
      if (b && ['All','Low','Medium','High','Critical'].includes(b)) setBand(b)
    }
    load(); sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
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

  /* Actions */
  const sendReminder = async (r) => {
    try {
      const resp = await api(`/api/ml/latepay/${encodeURIComponent(r.id)}/remind`, { method: 'POST' })
      const when = resp?.lastReminded || new Date().toISOString().slice(0,10)
      setRows(prev => prev.map(x => x.id===r.id ? { ...x, lastReminded: when } : x))
      notify.success('Reminder sent', `${r.customer} • ${r.number}`)
    } catch (e) {
      notify.error('Reminder failed', e?.message || '')
    }
  }

  const openPromise = (r) => {
    setTarget(r)
    setPromiseDate(r.promiseDate || new Date().toISOString().slice(0,10))
    setConfirmOpen(true)
  }

  const confirmPromise = async () => {
    if (!target) return
    try {
      const resp = await api(`/api/ml/latepay/${encodeURIComponent(target.id)}`, {
        method: 'PATCH',
        body: { promiseDate }
      })
      const when = resp?.promiseDate || promiseDate
      setRows(prev => prev.map(x => x.id===target.id ? { ...x, promiseDate: when } : x))
      notify.info('Promise recorded', `${target.customer} • ${dd(when)}`)
      setConfirmOpen(false); setTarget(null)
    } catch (e) {
      notify.error('Save failed', e?.message || '')
    }
  }

  const bulkRemind = async () => {
    const top = filtered.slice(0, 10)
    for (const r of top) { await sendReminder(r) }
    notify.info('Reminders queued', `${top.length} customer(s)`)
  }

  const exportCSV = () => {
    if (!filtered.length) { notify.info('Nothing to export'); return }
    const headers = ['number','customer','date','due','status','amount','riskScore','riskBand','promiseDate','lastReminded']
    const esc = (v)=> {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s
    }
    const csv = [headers.join(',')].concat(filtered.map(r => headers.map(h => esc(r[h])).join(','))).join('\n')
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download='late-pay-risk.csv'
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
    notify.success('Export ready', 'late-pay-risk.csv')
  }

  return (
    <Page
      title="Late Pay Risk"
      subtitle="Prioritize follow-ups with a simple risk score for each unpaid invoice."
      actions={
        <div className="flex gap-2">
          <BtnGhost onClick={exportCSV}>Export CSV</BtnGhost>
          <BtnGhost onClick={load}>{loading ? 'Loading…' : 'Refresh'}</BtnGhost>
          <Btn onClick={bulkRemind} disabled={!filtered.length}>Remind top 10 visible</Btn>
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
            {err && <div className="text-sm text-rose-700">{err}</div>}
          </div>
        </CardBody>
      </Card>

      {/* Table */}
      <div className="mt-4">
        <TableWrap>
          <DataTable
            empty={loading ? 'Loading…' : 'No unpaid invoices'}
            initialSort={{ key: 'riskScore', dir: 'desc' }}
            columns={[
              { key: 'number', header: '#'},
              { key: 'customer', header: 'Customer' },
              { key: 'amount', header: 'Amount', align: 'right', render: (r)=>inr(r.amount) },
              { key: 'date', header: 'Date', render: (r)=>dd(r.date) },
              { key: 'due', header: 'Due', render: (r)=>dd(r.due) },
              {
                key: 'status', header: 'Status',
                render: (r)=>(<Badge label={r.status} tone={r.status==='Overdue' ? 'rose' : 'amber'} />)
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

      {/* Promise modal */}
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

/* Small UI bits */
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
