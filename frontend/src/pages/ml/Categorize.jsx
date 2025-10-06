// src/pages/ml/Categorize.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import Page from '../../components/Page'
import Card, { CardHeader, CardBody } from '../../components/ui/Card'
import { TableWrap, DataTable } from '../../components/ui/Table'
import { Btn, BtnGhost } from '../../components/ui/Buttons'
import SweetAlert from '../../components/ui/SweetAlert'
import { notify } from '../../components/ui/Toast'
import { inr, dd } from '../../data/store'
import { api } from '../../lib/api'

const CATEGORIES = ['Uncategorized','Software','Utilities','Rent','Payroll','Supplies','Travel','Marketing','Fees','Other']

// same light rules locally (fallback if server suggest not reachable)
const KEYWORDS = [
  { k: ['aws','azure','gcp','digitalocean','vultr'], cat: 'Software' },
  { k: ['google workspace','gmail','notion','slack','github','gitlab','jira','confluence','zoom','adobe'], cat: 'Software' },
  { k: ['electric','electricity','power','water','wifi','internet','broadband','jio','airtel','vi','bsnl'], cat: 'Utilities' },
  { k: ['rent','lease'], cat: 'Rent' },
  { k: ['salary','payroll','stipend','wage','contractor'], cat: 'Payroll' },
  { k: ['paper','ink','stationery','toner','printer'], cat: 'Supplies' },
  { k: ['hotel','flight','air','uber','ola','train','travel','booking'], cat: 'Travel' },
  { k: ['facebook ads','google ads','linkedin ads','campaign','adwords','meta'], cat: 'Marketing' },
  { k: ['fee','charge','commission','processing'], cat: 'Fees' },
]
const toText = (v) => (v || '').toString().toLowerCase()
function localSuggest(row){
  const hay = `${toText(row.party)} ${toText(row.description)}`
  for (const r of KEYWORDS) if (r.k.some(w => hay.includes(w))) return r.cat
  return row.kind === 'PAYMENT' ? 'Other' : 'Supplies'
}

export default function MLCategorize() {
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const [onlyUncat, setOnlyUncat] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  // keep initial categories to compute minimal PATCH payload
  const initialCat = useRef(new Map())

  const load = async () => {
    setLoading(true); setErr('')
    try {
      const qs = new URLSearchParams()
      if (onlyUncat) qs.set('onlyUncategorized','true')
      const res = await api(`/api/ml/categorize?${qs.toString()}`)
      const r = Array.isArray(res?.rows) ? res.rows : []
      setRows(r)
      // snapshot categories
      const map = new Map()
      r.forEach(x => map.set(x.id, x.category || 'Uncategorized'))
      initialCat.current = map
    } catch (e) {
      setErr(e?.message || 'Failed to load'); setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [onlyUncat])

  const filtered = useMemo(() => {
    let list = rows
    if (cat !== 'All') list = list.filter(r => r.category === cat)
    if (q.trim()) {
      const s = q.toLowerCase()
      list = list.filter(r =>
        toText(r.id).includes(s) ||
        toText(r.party).includes(s) ||
        toText(r.description).includes(s)
      )
    }
    return list
  }, [rows, q, cat])

  const byCat = useMemo(() => {
    const m = {}; CATEGORIES.forEach(c => m[c]=0)
    rows.forEach(r => { m[r.category || 'Uncategorized'] = (m[r.category || 'Uncategorized'] || 0) + (r.amount||0) })
    return m
  }, [rows])

  const uncatCount = rows.filter(r => (r.category||'Uncategorized') === 'Uncategorized').length
  const totalAmt = rows.reduce((a,b)=>a + (b.amount||0), 0)

  // selection
  const [selected, setSelected] = useState(new Set())
  const onToggleSelect = (id, on) => setSelected(prev => {
    const next = new Set(prev); on ? next.add(id) : next.delete(id); return next
  })

  const setRowCategory = (id, newCat) => {
    setRows(prev => prev.map(r => r.id === id ? ({ ...r, category: newCat }) : r))
  }

  // try server-side suggest first; fallback to local
  const applySuggestionTo = async (ids) => {
    const targets = rows.filter(r => ids.includes(r.id))
    if (!targets.length) return
    try {
      const resp = await api('/api/ml/categorize/suggest', {
        method: 'POST',
        body: { rows: targets.map(({ id, kind, party, description }) => ({ id, kind, party, description })) }
      })
      const map = new Map((resp?.suggestions||[]).map(s => [s.id, s.category]))
      setRows(prev => prev.map(r => ids.includes(r.id) ? ({ ...r, category: map.get(r.id) || localSuggest(r) }) : r))
    } catch {
      setRows(prev => prev.map(r => ids.includes(r.id) ? ({ ...r, category: localSuggest(r) }) : r))
    }
  }

  const saveAll = async () => {
    const updates = rows
      .filter(r => initialCat.current.get(r.id) !== (r.category || 'Uncategorized'))
      .map(r => ({ kind: r.kind, id: r.id, category: r.category || 'Uncategorized' }))
    if (!updates.length) { notify.info('Nothing to save'); return }
    try {
      const res = await api('/api/ml/categorize', { method: 'PATCH', body: { updates } })
      notify.success('Categories saved', `${res?.ok || updates.length} updated`)
      // refresh baseline
      updates.forEach(u => initialCat.current.set(u.id, u.category))
    } catch (e) {
      notify.error('Save failed', e?.message || '')
    }
  }

  // confirm modal (bulk apply)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [targetAction, setTargetAction] = useState(null)
  const applyAll = () => { setTargetAction('all'); setConfirmOpen(true) }
  const applySelected = () => { setTargetAction('sel'); setConfirmOpen(true) }
  const onConfirm = async () => {
    if (targetAction === 'all') await applySuggestionTo(filtered.map(r => r.id))
    if (targetAction === 'sel') await applySuggestionTo([...selected])
    setConfirmOpen(false); setTargetAction(null)
  }

  return (
    <Page
      title="Analytics & AI — Categorize"
      subtitle="Classify bills and payments into categories. Suggestions are served by your backend (with local fallback)."
      actions={
        <div className="flex gap-2">
          <BtnGhost onClick={load}>{loading ? 'Loading…' : 'Refresh'}</BtnGhost>
          <Btn onClick={saveAll}>Save categories</Btn>
        </div>
      }
    >
      {/* Summary tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <Tile tone="amber" title="Uncategorized" value={uncatCount} hint="items to review" />
        <Tile tone="emerald" title="Total amount" value={inr(totalAmt)} />
        <Tile tone="sky" title="Bills amount" value={inr(rows.filter(r=>r.kind==='BILL').reduce((a,b)=>a+b.amount,0))} />
        <Tile tone="rose" title="Payments amount" value={inr(rows.filter(r=>r.kind==='PAYMENT').reduce((a,b)=>a+b.amount,0))} />
        <Tile tone="emerald" title="Top category" value={topCategory(byCat)} hint="by amount" />
      </div>

      {/* Filters & bulk actions */}
      <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Category totals" subtitle="Sum of amounts by category" />
          <CardBody>
            <TableWrap>
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur text-slate-600">
                  <tr><th className="py-3 px-3 text-left">Category</th><th className="py-3 px-3 text-right">Amount</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {CATEGORIES.map(c => (
                    <tr key={c} className="hover:bg-slate-50">
                      <td className="py-3 px-3">{c}</td>
                      <td className="py-3 px-3 text-right">{inr(byCat[c] || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Filters & bulk actions" subtitle="Find items and apply AI suggestions" />
          <CardBody>
            <div className="flex flex-wrap items-center gap-3">
              <input
                className="w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="Search id, party or description"
                value={q}
                onChange={(e)=>setQ(e.target.value)}
              />
              <select
                className="w-56 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                value={cat}
                onChange={(e)=>setCat(e.target.value)}
              >
                <option value="All">All categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={onlyUncat} onChange={(e)=>setOnlyUncat(e.target.checked)} />
                Only uncategorized
              </label>
              <div className="grow" />
              <BtnGhost onClick={applySelected} disabled={!selected.size}>AI for selected</BtnGhost>
              <Btn onClick={applyAll} disabled={!filtered.length}>AI for all</Btn>
            </div>
            {err && <div className="mt-2 text-sm text-rose-700">{err}</div>}
          </CardBody>
        </Card>
      </div>

      {/* Work table */}
      <div className="mt-4">
        <TableWrap>
          <DataTable
            empty={loading ? 'Loading…' : 'Nothing to review'}
            initialSort={{ key: 'date', dir: 'desc' }}
            columns={[
              {
                key: '_sel', header: '', width: 24,
                render: (r) => (
                  <input type="checkbox" checked={selected.has(r.id)} onChange={(e)=>onToggleSelect(r.id, e.target.checked)} />
                )
              },
              { key: 'date', header: 'Date', render: (r)=>dd(r.date) },
              { key: 'id', header: 'ID' },
              { key: 'kind', header: 'Type', render: (r)=><Badge tone={r.kind==='BILL'?'rose':'emerald'} label={r.kind} /> },
              { key: 'source', header: 'Source' },
              { key: 'party', header: 'Party' },
              { key: 'description', header: 'Description' },
              { key: 'amount', header: 'Amount', align: 'right', render: (r)=>inr(r.amount) },
              {
                key: 'category', header: 'Category',
                render: (r)=>(
                  <select
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                    value={r.category || 'Uncategorized'}
                    onChange={(e)=>setRowCategory(r.id, e.target.value)}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )
              },
              {
                key: '_ai', header: 'AI', align: 'right',
                render: (r)=>(<BtnGhost onClick={async ()=>{
                  await applySuggestionTo([r.id])
                  notify.info('Suggested', `${r.id} updated`)
                }}>Suggest</BtnGhost>)
              }
            ]}
            rows={filtered}
          />
        </TableWrap>
      </div>

      {/* Confirm modal */}
      <SweetAlert
        open={confirmOpen}
        title="Apply AI suggestions?"
        message={targetAction === 'sel'
          ? `This will suggest categories for ${selected.size} selected item(s).`
          : 'This will suggest categories for ALL visible rows.'}
        confirmText="Apply"
        cancelText="Cancel"
        tone="emerald"
        onConfirm={onConfirm}
        onCancel={()=>{ setConfirmOpen(false); setTargetAction(null) }}
      />
    </Page>
  )
}

/* UI bits */
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
function topCategory(byCatObj){
  let best = '—', max = -1
  Object.entries(byCatObj).forEach(([k,v]) => { if (v > max && k !== 'Uncategorized') { max=v; best=k } })
  return best
}
