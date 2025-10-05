// src/pages/ml/Categorize.jsx
import React, { useEffect, useMemo, useState } from 'react'
import Page from '../../components/Page'
import Card, { CardHeader, CardBody } from '../../components/ui/Card'
import { TableWrap, DataTable } from '../../components/ui/Table'
import { Btn, BtnGhost } from '../../components/ui/Buttons'
import SweetAlert from '../../components/ui/SweetAlert'
import { notify } from '../../components/ui/Toast'
import { data as store, inr, dd } from '../../data/store'

/* ---------------------------------- Setup ---------------------------------- */
// Define the categories you care about (edit freely)
const CATEGORIES = ['Uncategorized', 'Software', 'Utilities', 'Rent', 'Payroll', 'Supplies', 'Travel', 'Marketing', 'Fees', 'Other']

// Simple keyword → category map for on-device "AI" suggestions (placeholder rules).
// You can later swap this for a backend ML endpoint; the UI will stay the same.
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

// Merge Bills (money out) + Payments (money in) into a single list for categorization.
// Each row will carry {kind: 'BILL'|'PAYMENT'} and keep reference into store to persist.
function buildItems() {
  const out = []
  ;(store.bills || []).forEach(b => {
    out.push({
      kind: 'BILL',
      id: b.id,
      date: b.date,
      party: b.vendor,
      description: b.memo || b.desc || '',
      amount: Number(b.amount) || 0,
      category: b.category || 'Uncategorized',
      source: 'Bills',
      status: b.status || 'Open',
      _ref: b,
    })
  })
  ;(store.payments || []).forEach(p => {
    out.push({
      kind: 'PAYMENT',
      id: p.id,
      date: p.date,
      party: p.customer,
      description: p.note || p.desc || '',
      amount: Number(p.amount) || 0,
      category: p.category || 'Uncategorized',
      source: 'Payments',
      method: p.method,
      _ref: p,
    })
  })
  // newest first
  out.sort((a,b)=> new Date(b.date) - new Date(a.date))
  return out
}

/* --------------------------------- Helpers --------------------------------- */
const toText = (v) => (v || '').toString().toLowerCase()

function suggestOne(row){
  const hay = `${toText(row.party)} ${toText(row.description)}`
  for (const rule of KEYWORDS) {
    if (rule.k.some(w => hay.includes(w))) return rule.cat
  }
  // fallback heuristics
  if (row.kind === 'PAYMENT') return 'Other'
  return 'Supplies'
}

function exportCSV(rows, filename='categorized-items.csv') {
  if (!rows.length) { notify.info('Nothing to export'); return }
  const headers = ['id','date','kind','source','party','description','amount','category']
  const esc = (s)=> {
    const v = String(s ?? '')
    return /[",\n]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v
  }
  const csv = [headers.join(',')].concat(rows.map(r => headers.map(h => esc(r[h])).join(','))).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  notify.success('Export ready', filename)
}

/* --------------------------------- Component -------------------------------- */
export default function MLCategorize() {
  const [rows, setRows] = useState(buildItems)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const [onlyUncat, setOnlyUncat] = useState(false)

  // selection for bulk ops
  const [selected, setSelected] = useState(new Set())

  // confirm modal (bulk apply)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [targetAction, setTargetAction] = useState(null) // 'applyAll'|'applySelected'

  // refresh when store changes from other pages (simple listener)
  useEffect(() => {
    // optional: poll-less refresh on hash nav
    const onHash = () => setRows(buildItems())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // computed analytics
  const filtered = useMemo(() => {
    let list = rows
    if (cat !== 'All') list = list.filter(r => r.category === cat)
    if (onlyUncat) list = list.filter(r => r.category === 'Uncategorized')
    if (q.trim()) {
      const s = q.toLowerCase()
      list = list.filter(r =>
        toText(r.id).includes(s) ||
        toText(r.party).includes(s) ||
        toText(r.description).includes(s)
      )
    }
    return list
  }, [rows, q, cat, onlyUncat])

  const byCat = useMemo(() => {
    const m = {}; CATEGORIES.forEach(c => m[c]=0)
    rows.forEach(r => { m[r.category] = (m[r.category] || 0) + r.amount })
    return m
  }, [rows])

  const uncatCount = rows.filter(r => r.category === 'Uncategorized').length
  const totalAmt = rows.reduce((a,b)=>a + (b.amount||0), 0)

  /* ------------------------------ Handlers ------------------------------ */
  const setRowCategory = (id, newCat) => {
    setRows(prev => prev.map(r => r.id === id ? ({ ...r, category: newCat }) : r))
  }

  const onToggleSelect = (id, on) => {
    setSelected(prev => {
      const next = new Set(prev)
      on ? next.add(id) : next.delete(id)
      return next
    })
  }

  const applySuggestionTo = (ids) => {
    if (!ids.length) return
    const next = rows.map(r => {
      if (!ids.includes(r.id)) return r
      const sug = suggestOne(r)
      return { ...r, category: sug }
    })
    setRows(next)
  }

  const saveAll = () => {
    // Persist categories back to the shared store objects
    rows.forEach(r => {
      if (r.kind === 'BILL') r._ref.category = r.category
      else if (r.kind === 'PAYMENT') r._ref.category = r.category
    })
    notify.success('Categories saved', 'Synced with Bills/Payments')
  }

  const applyAll = () => { setTargetAction('applyAll'); setConfirmOpen(true) }
  const applySelected = () => { setTargetAction('applySelected'); setConfirmOpen(true) }

  const onConfirm = () => {
    if (targetAction === 'applyAll') {
      applySuggestionTo(rows.map(r => r.id))
      notify.info('Suggestions applied', 'All rows updated')
    } else if (targetAction === 'applySelected') {
      applySuggestionTo([...selected])
      notify.info('Suggestions applied', `${selected.size} selected row(s) updated`)
    }
    setConfirmOpen(false); setTargetAction(null)
  }

  /* ----------------------------------- UI ----------------------------------- */
  return (
    <Page
      title="Analytics & AI — Categorize"
      subtitle="Classify bills and payments into expense/income categories. Suggestions run locally (no server needed)."
      actions={
        <div className="flex gap-2">
          <BtnGhost onClick={()=>exportCSV(filtered, 'categorized-filtered.csv')}>Export CSV</BtnGhost>
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

      {/* Category totals table (small analytics) */}
      <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Category totals" subtitle="Sum of amounts by category" />
          <CardBody>
            <TableWrap>
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur text-slate-600">
                  <tr>
                    <th className="py-3 px-3 text-left">Category</th>
                    <th className="py-3 px-3 text-right">Amount</th>
                  </tr>
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
                <input
                  type="checkbox"
                  checked={onlyUncat}
                  onChange={(e)=>setOnlyUncat(e.target.checked)}
                />
                Only uncategorized
              </label>
              <div className="grow" />
              <BtnGhost onClick={applySelected}>AI for selected</BtnGhost>
              <Btn onClick={applyAll}>AI for all</Btn>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Work table */}
      <div className="mt-4">
        <TableWrap>
          <DataTable
            empty="Nothing to review"
            initialSort={{ key: 'date', dir: 'desc' }}
            columns={[
              {
                key: '_sel',
                header: '',
                width: 24,
                render: (r) => (
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={(e)=>onToggleSelect(r.id, e.target.checked)}
                  />
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
                key: 'category',
                header: 'Category',
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
                key: '_ai',
                header: 'AI',
                align: 'right',
                render: (r)=>(
                  <BtnGhost onClick={()=>{
                    const sug = suggestOne(r)
                    setRowCategory(r.id, sug)
                    notify.info('Suggested', `${r.id} → ${sug}`)
                  }}>Suggest</BtnGhost>
                )
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
        message={targetAction === 'applySelected'
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

/* ------------------------------- Small UI bits ------------------------------ */
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
