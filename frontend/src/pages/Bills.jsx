// src/pages/Bills.jsx
import React, { useMemo, useState, useEffect } from 'react'
import Page from '../components/Page'
import { TableWrap, DataTable } from '../components/ui/Table'
import { Btn, BtnGhost, BtnDanger } from '../components/ui/Buttons'
import SweetAlert from '../components/ui/SweetAlert'
import { notify } from '../components/ui/Toast'
import { inr, dd } from '../data/store'
import { api } from '../lib/api'
import VendorSelect from '../components/VendorSelect'

const STATUS = ['All', 'Open', 'Overdue', 'Paid']

/* ------------------------ Helpers ------------------------ */
const isObjectId = (s) => /^[0-9a-fA-F]{24}$/.test(String(s || ''))
const genBillId = () => {
  const d = new Date()
  const y = String(d.getFullYear()).slice(-2)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const rnd = Math.random().toString(36).slice(2, 9).toUpperCase() // 7 chars
  return `BILL-${y}${m}${day}-${rnd}`
}
function validateBill(values) {
  const e = {}
  if (!values.vendor) e.vendor = 'Vendor required'
  if (values.amount == null || Number(values.amount) <= 0) e.amount = 'Amount must be > 0'
  if (!values.date || Number.isNaN(Date.parse(values.date))) e.date = 'Valid bill date required'
  if (!values.due  || Number.isNaN(Date.parse(values.due)))  e.due  = 'Valid due date required'
  if (!values.status || !['Open','Overdue','Paid'].includes(values.status)) e.status = 'Choose status'
  return e
}

/* -------------------------- API -------------------------- */
const listBills  = async (query='') => api(`/api/bills${query}`)
const createBill = async (body) => api('/api/bills', { method: 'POST', body })
const updateBill = async (id, body) => api(`/api/bills/${encodeURIComponent(id)}`, { method: 'PUT', body })
const deleteBill = async (id) => api(`/api/bills/${encodeURIComponent(id)}`, { method: 'DELETE' })

export default function Bills() {
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('All')

  // modals
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [target, setTarget] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formInitial, setFormInitial] = useState(null)
  const [formErrors, setFormErrors] = useState({})

  /* --- Read ?status= and #new from hash --- */
  useEffect(() => {
    const handle = () => {
      const [, after=''] = window.location.hash.split('#/')
      const qs = ('#' + after).split('?')[1] || ''
      const params = new URLSearchParams(qs)
      const s = params.get('status')
      if (s && STATUS.includes(s)) setStatus(s)
      if (window.location.hash.split('#').includes('new')) openCreate()
    }
    handle()
    window.addEventListener('hashchange', handle)
    return () => window.removeEventListener('hashchange', handle)
  }, [])

  /* --------------------------- Load --------------------------- */
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const qs = new URLSearchParams()
        if (q.trim()) qs.set('q', q.trim())
        if (status !== 'All') qs.set('status', status)
        const data = await listBills(qs.toString() ? `?${qs}` : '')
        if (alive) setRows(Array.isArray(data) ? data : [])
      } catch (e) {
        console.error(e)
        notify.error('Failed to load bills', e.message || 'Try again')
      }
    })()
    return () => { alive = false }
  }, [q, status])

  /* ------------------------- Filtering ------------------------ */
  const filtered = useMemo(() => {
    let list = rows
    if (q.trim()) {
      const s = q.toLowerCase()
      list = list.filter(r =>
        (r.vendor || '').toLowerCase().includes(s) ||
        (r.id || '').toLowerCase().includes(s)
      )
    }
    if (status !== 'All') list = list.filter(r => r.status === status)
    return list
  }, [rows, q, status])

  /* --------------------------- CRUD --------------------------- */
  const openDelete = (row) => { setTarget(row); setConfirmOpen(true) }
  const confirmDelete = async () => {
    const id = target?.id || target?._id
    if (!id) return setConfirmOpen(false)
    const prev = rows
    setRows(rows.filter(r => (r.id || r._id) !== id))
    setConfirmOpen(false); setTarget(null)
    try {
      await deleteBill(id)
      notify.error('Bill deleted', `Removed ${id}`)
    } catch (e) {
      setRows(prev)
      notify.error('Delete failed', e.message || 'Try again')
    }
  }

  const openCreate = () => {
    setFormInitial({
      id: '', // let backend assign; if required, we'll fallback in submit
      vendor: '',
      vendorId: '',
      date: new Date().toISOString().slice(0,10),
      due: '',
      amount: '',
      status: 'Open',
    })
    setFormErrors({})
    setFormOpen(true)
  }

  const openEdit = (row) => {
    const asDate = (v) => {
      if (!v) return ''
      const d = new Date(v)
      return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0,10)
    }
    setFormInitial({
      ...row,
      date: asDate(row.date),
      due:  asDate(row.due),
    })
    setFormErrors({})
    setFormOpen(true)
  }

  const submitForm = async () => {
    const errors = validateBill(formInitial || {})
    setFormErrors(errors)
    if (Object.keys(errors).length) return

    const isEdit = !!rows.find(r => (r.id || r._id) === (formInitial.id || formInitial._id))
    let payload = { ...formInitial }

    // Only send a valid ObjectId for vendorId
    if (!isObjectId(payload.vendorId)) delete payload.vendorId

    // On create, prefer letting backend assign the ID
    if (!isEdit && (!payload.id || !payload.id.trim())) delete payload.id

    const send = () =>
      isEdit
        ? updateBill(payload.id || payload._id, payload)
        : createBill(payload)

    notify.promise(send(), {
      pending: { title: isEdit ? 'Saving…' : 'Recording bill…', message: 'Please wait' },
      success: (res) => ({ title: isEdit ? 'Updated ✅' : 'Created 🎉', message: `${res.vendor} • ${inr(Number(res.amount)||0)}` }),
      error:   (err) => ({ title: 'Failed ❌', message: err?.message || '' }),
    })

    try {
      const res = await send()
      const key = res.id || res._id
      const idx = rows.findIndex(r => (r.id || r._id) === key)
      const next = [...rows]
      if (idx >= 0) next[idx] = res; else next.unshift(res)
      setRows(next)
      setFormOpen(false)
    } catch (e) {
      const msg = String(e?.message || '').toLowerCase()

      // If server *requires* an ID, or we hit duplicate, fallback to a strong client ID and retry once
      const needsId = e.status === 400 && (msg.includes('id') || msg.includes('required'))
      const dup     = e.status === 409 || msg.includes('exists') || msg.includes('duplicate')
      if (!isEdit && (needsId || dup)) {
        try {
          payload = { ...payload, id: genBillId() }
          setFormInitial(payload)
          const res2 = await (isEdit ? updateBill(payload.id || payload._id, payload) : createBill(payload))
          const key2 = res2.id || res2._id
          const idx2 = rows.findIndex(r => (r.id || r._id) === key2)
          const next2 = [...rows]
          if (idx2 >= 0) next2[idx2] = res2; else next2.unshift(res2)
          setRows(next2)
          setFormOpen(false)
          notify.info('Assigned Bill ID', payload.id)
          return
        } catch (e2) {
          console.error(e2)
        }
      }

      console.error(e)
    }
  }

  const isEditing =
    !!(formInitial?.id || formInitial?._id) &&
    rows.some(r => (r.id || r._id) === (formInitial?.id || formInitial?._id))

  /* ----------------------------- UI ---------------------------- */
  return (
    <Page title="Bills" subtitle="Track and manage payables" actions={<Btn onClick={openCreate}>+ New Bill</Btn>}>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
          placeholder="Search vendor or bill id"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="w-44 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <TableWrap>
        <DataTable
          empty="No bills"
          initialSort={{ key: 'due', dir: 'asc' }}
          columns={[
            { key: 'id', header: 'ID', render: (r)=> r.id || r._id },
            { key: 'vendor', header: 'Vendor' },
            { key: 'date', header: 'Bill Date', render: (r)=> dd(r.date) },
            { key: 'due', header: 'Due', render: (r)=> dd(r.due) },
            { key: 'amount', header: 'Amount', align: 'right', render: (r)=> inr(Number(r.amount)||0) },
            {
              key: 'status', header: 'Status',
              render: (r)=>(
                <span className={
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs border ' +
                  (r.status === 'Paid'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : r.status === 'Overdue'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200')
                }>
                  {r.status}
                </span>
              )
            },
            { key: '_actions', header: 'Actions', align: 'right',
              render: (r)=>(
                <div className="flex justify-end gap-2">
                  <BtnGhost onClick={()=>openEdit(r)}>Edit</BtnGhost>
                  <BtnDanger onClick={()=>openDelete(r)}>Delete</BtnDanger>
                </div>
              )
            },
          ]}
          rows={filtered}
        />
      </TableWrap>

      {/* SweetAlert: Delete */}
      <SweetAlert
        open={confirmOpen}
        title="Delete bill?"
        message={target ? `This will remove ${target.id || target._id} from payables.` : ''}
        confirmText="Delete"
        cancelText="Cancel"
        tone="rose"
        onConfirm={confirmDelete}
        onCancel={()=>setConfirmOpen(false)}
      />

      {/* SweetAlert: Create/Edit form */}
      <SweetAlert
        open={formOpen}
        title={isEditing ? 'Edit bill' : 'New bill'}
        message="Fill the required fields below."
        confirmText={isEditing ? 'Save' : 'Create'}
        cancelText="Cancel"
        tone="emerald"
        onConfirm={submitForm}
        onCancel={()=>setFormOpen(false)}
      >
        {formInitial && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bill ID">
              <input
                className={inClass()}
                value={formInitial.id || ''}
                readOnly={true /* server assigns or we fallback in submit */}
                placeholder="(auto)"
              />
            </Field>

            <Field label="Vendor" error={formErrors.vendor}>
              <VendorSelect
                initialQuery={formInitial.vendor || ''}
                onPick={(v) => {
                  setFormInitial({
                    ...formInitial,
                    vendor: v.name,
                    vendorId: v._id, // MUST be ObjectId string
                  })
                }}
              />
            </Field>

            <Field label="Bill date" error={formErrors.date}>
              <input
                type="date"
                className={inClass(formErrors.date)}
                value={formInitial.date || ''}
                onChange={(e)=>setFormInitial({ ...formInitial, date: e.target.value })}
              />
            </Field>
            <Field label="Due date" error={formErrors.due}>
              <input
                type="date"
                className={inClass(formErrors.due)}
                value={formInitial.due || ''}
                onChange={(e)=>setFormInitial({ ...formInitial, due: e.target.value })}
              />
            </Field>

            <Field label="Amount (₹)" error={formErrors.amount}>
              <input
                type="number"
                className={inClass(formErrors.amount)}
                value={formInitial.amount}
                onChange={(e)=>setFormInitial({ ...formInitial, amount: Number(e.target.value) })}
              />
            </Field>

            <Field label="Status" error={formErrors.status}>
              <select
                className={inClass(formErrors.status)}
                value={formInitial.status}
                onChange={(e)=>setFormInitial({ ...formInitial, status: e.target.value })}
              >
                <option>Open</option>
                <option>Overdue</option>
                <option>Paid</option>
              </select>
            </Field>
          </div>
        )}
      </SweetAlert>
    </Page>
  )
}

function Field({ label, error, children }) {
  return (
    <label className="block">
      <div className="text-xs text-slate-600 mb-1">{label}</div>
      {children}
      {error && <div className="mt-1 text-[11px] text-rose-600">{error}</div>}
    </label>
  )
}
function inClass(err){
  return [
    'w-full rounded-lg border px-3 py-2 text-sm outline-none',
    err ? 'border-rose-300 focus:ring-2 focus:ring-rose-300'
        : 'border-slate-300 focus:ring-2 focus:ring-emerald-400'
  ].join(' ')
}
