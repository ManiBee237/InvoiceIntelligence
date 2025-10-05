// src/pages/Payments.jsx
import React, { useMemo, useState, useEffect } from 'react'
import Page from '../components/Page'
import { TableWrap, DataTable } from '../components/ui/Table'
import { Btn, BtnGhost, BtnDanger } from '../components/ui/Buttons'
import SweetAlert from '../components/ui/SweetAlert'
import { notify } from '../components/ui/Toast'
import { inr, dd } from '../data/store'
import { api } from '../lib/api'

const METHODS = ['All', 'UPI', 'Bank', 'Card', 'Cash']

/* --------------------------------- Validate --------------------------------- */
function validatePayment(values) {
  const errors = {}
  if (!values.customer || String(values.customer).trim() === '') errors.customer = 'Customer is required'
  if (!values.invoice || String(values.invoice).trim() === '') errors.invoice = 'Invoice is required'
  if (values.amount == null || Number(values.amount) < 1) errors.amount = 'Amount must be ≥ 1'
  if (!values.date || Number.isNaN(Date.parse(values.date))) errors.date = 'Valid date required'
  if (!values.method || !['UPI','Bank','Card','Cash'].includes(values.method)) errors.method = 'Choose a method'
  return errors
}

// API helpers
const fetchPayments = async () => api('/api/payments?limit=500')
const createPayment = async (body) => api('/api/payments', { method: 'POST', body })
const updatePayment = async (id, body) => api(`/api/payments/${id}`, { method: 'PUT', body })
const deletePayment = async (id) => api(`/api/payments/${id}`, { method: 'DELETE' })

export default function Payments() {
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [method, setMethod] = useState('All')

  // modals
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [target, setTarget] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formInitial, setFormInitial] = useState(null)
  const [formErrors, setFormErrors] = useState({})

  // load data once
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchPayments()
        setRows(Array.isArray(data) ? data : [])
      } catch (e) {
        console.error(e)
        notify.error('Failed to load payments', e.message || 'Try again')
      }
    })()
  }, [])

  /* ------------------------------- Filtering ------------------------------- */
  const filtered = useMemo(() => {
    let list = rows
    if (method !== 'All') list = list.filter(r => r.method === method)
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      list = list.filter(r =>
        (r.customer || '').toLowerCase().includes(s) ||
        (r.invoice || '').toLowerCase().includes(s) ||
        (r.id || '').toLowerCase().includes(s)
      )
    }
    return list
  }, [rows, q, method])

  /* --------------------------------- CRUD ---------------------------------- */
  const openDelete = (row) => { setTarget(row); setConfirmOpen(true) }

  const confirmDelete = async () => {
    const id = target?._id || target?.id
    if (!id) return setConfirmOpen(false)

    // optimistic UI
    const prev = rows
    const next = rows.filter(r => (r._id || r.id) !== id)
    setRows(next)
    setConfirmOpen(false); setTarget(null)

    try {
      await deletePayment(id)
      notify.error('Payment deleted', `Receipt ${id} removed`)
    } catch (e) {
      // revert on failure
      setRows(prev)
      notify.error('Delete failed', e.message || 'Try again')
    }
  }

  const genReceiptId = () => `PM-${Date.now().toString().slice(-6)}`

  const openCreate = () => {
    setFormInitial({
      id: genReceiptId(),
      date: new Date().toISOString().slice(0,10),
      method: 'UPI',
      customer: '',
      invoice: '',
      amount: '',
    })
    setFormErrors({})
    setFormOpen(true)
  }

  const openEdit = (row) => {
    setFormInitial({ ...row })
    setFormErrors({})
    setFormOpen(true)
  }

  const submitForm = async () => {
    const values = { ...formInitial }
    const errors = validatePayment(values || {})
    setFormErrors(errors)
    if (Object.keys(errors).length) return

    const isEdit = !!rows.find(r => (r._id || r.id) === (values._id || values.id))
    const promise = isEdit
      ? updatePayment(values._id || values.id, values)
      : createPayment(values)

    notify.promise(promise, {
      pending: { title: isEdit ? 'Saving changes…' : 'Recording payment…', message: 'Please wait' },
      success: (res) => ({ title: isEdit ? 'Payment updated ✅' : 'Payment recorded 🎉', message: `${inr(res.amount)} from ${res.customer}` }),
      error:   (err) => ({ title: 'Failed ❌', message: err?.message || 'Try again' }),
    })

    try {
      const res = await promise
      const id  = res._id || res.id
      const idx = rows.findIndex(r => (r._id || r.id) === id)
      let next
      if (idx >= 0) { next = [...rows]; next[idx] = { ...next[idx], ...res } }
      else { next = [{ ...res }, ...rows] }
      setRows(next)
      setFormOpen(false)
    } catch (err) {
      console.error(err)
    }
  }

  /* --------------------------------- UI ------------------------------------ */
  return (
    <Page
      title="Payments"
      subtitle="Search, filter, and manage incoming payments."
      actions={<Btn onClick={openCreate}>+ Add Payment</Btn>}
    >
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none
                     focus:ring-2 focus:ring-emerald-400"
          placeholder="Search customer, invoice, or receipt"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="w-44 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none
                     focus:ring-2 focus:ring-emerald-400"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Table */}
      <TableWrap>
        <DataTable
          empty="No payments"
          initialSort={{ key: 'date', dir: 'desc' }}
          columns={[
            { key: 'id', header: 'ID' },
            { key: 'date', header: 'Date', render: (r) => dd(r.date) },
            { key: 'customer', header: 'Customer' },
            { key: 'invoice', header: 'Invoice #' },
            {
              key: 'method',
              header: 'Method',
              render: (r) => (
                <span className={
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs border ' +
                  (r.method === 'UPI'
                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                    : r.method === 'Card'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : r.method === 'Cash'
                    ? 'bg-slate-50 text-slate-700 border-slate-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200') // Bank
                }>
                  {r.method}
                </span>
              )
            },
            {
              key: 'amount', header: 'Amount', align: 'right',
              render: (r) => inr(Number(r.amount) || 0)
            },
            {
              key: '_actions',
              header: 'Actions',
              align: 'right',
              render: (r) => (
                <div className="flex justify-end gap-2">
                  <BtnGhost onClick={() => openEdit(r)}>Edit</BtnGhost>
                  <BtnDanger onClick={() => openDelete(r)}>Delete</BtnDanger>
                </div>
              )
            },
          ]}
          rows={filtered}
        />
      </TableWrap>

      {/* SweetAlert: Delete confirm */}
      <SweetAlert
        open={confirmOpen}
        title="Delete payment?"
        message={target ? `This will permanently remove receipt ${target.id || target._id}.` : ''}
        confirmText="Delete"
        cancelText="Cancel"
        tone="rose"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* SweetAlert: Create/Edit form */}
      <SweetAlert
        open={formOpen}
        title={formInitial?.id && rows.find(r => (r.id || r._id) === formInitial.id) ? 'Edit payment' : 'New payment'}
        message="Fill the required fields below."
        confirmText={formInitial?.id && rows.find(r => (r.id || r._id) === formInitial.id) ? 'Save' : 'Create'}
        cancelText="Cancel"
        tone="emerald"
        onConfirm={submitForm}
        onCancel={() => setFormOpen(false)}
      >
        {formInitial && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Receipt ID">
              <input
                className={inClass()}
                value={formInitial.id || ''}
                onChange={(e)=>setFormInitial({ ...formInitial, id: e.target.value })}
              />
            </Field>
            <Field label="Date" error={formErrors.date}>
              <input
                type="date"
                className={inClass(formErrors.date)}
                value={formInitial.date || ''}
                onChange={(e)=>setFormInitial({ ...formInitial, date: e.target.value })}
              />
            </Field>

            <Field label="Customer" error={formErrors.customer}>
              <input
                className={inClass(formErrors.customer)}
                value={formInitial.customer || ''}
                onChange={(e)=>setFormInitial({ ...formInitial, customer: e.target.value })}
              />
            </Field>
            <Field label="Invoice #" error={formErrors.invoice}>
              <input
                className={inClass(formErrors.invoice)}
                value={formInitial.invoice || ''}
                onChange={(e)=>setFormInitial({ ...formInitial, invoice: e.target.value })}
              />
            </Field>

            <Field label="Method" error={formErrors.method}>
              <select
                className={inClass(formErrors.method)}
                value={formInitial.method || 'UPI'}
                onChange={(e)=>setFormInitial({ ...formInitial, method: e.target.value })}
              >
                <option>UPI</option>
                <option>Bank</option>
                <option>Card</option>
                <option>Cash</option>
              </select>
            </Field>
            <Field label="Amount (₹)" error={formErrors.amount}>
              <input
                type="number"
                className={inClass(formErrors.amount)}
                value={formInitial.amount ?? ''}
                onChange={(e)=>setFormInitial({ ...formInitial, amount: Number(e.target.value) })}
              />
            </Field>
          </div>
        )}
      </SweetAlert>
    </Page>
  )
}

/* helpers */
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
