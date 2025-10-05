// src/pages/Customers.jsx
import React, { useMemo, useState, useEffect } from 'react'
import Page from '../components/Page'
import { TableWrap, DataTable } from '../components/ui/Table'
import { Btn, BtnGhost, BtnDanger } from '../components/ui/Buttons'
import SweetAlert from '../components/ui/SweetAlert'
import { notify } from '../components/ui/Toast'
import { api } from '../lib/api'

/* ------------------------ ID generator ------------------------ */
const pad = (n, w = 4) => String(n).padStart(w, '0')
const genCustomerId = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const r = Math.floor(Math.random() * 10000)
  return `CUS-${y}${m}-${pad(r)}`
}

/* --------------------------- Validate ------------------------- */
function validateCustomer(values) {
  const errors = {}
  if (!values.name) errors.name = 'Name required'
  if (!values.email) errors.email = 'Email required'
  return errors
}

/* --------------------------- API ------------------------------ */
const listCustomers   = async (q='') => api(`/api/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`)
const createCustomer  = async (body) => api('/api/customers', { method: 'POST', body })
const updateCustomer  = async (id, body) => api(`/api/customers/${encodeURIComponent(id)}`, { method: 'PUT', body })
const deleteCustomer  = async (id) => api(`/api/customers/${encodeURIComponent(id)}`, { method: 'DELETE' })

export default function Customers() {
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')

  // modals
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [target, setTarget] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formInitial, setFormInitial] = useState(null)
  const [formErrors, setFormErrors] = useState({})

  /* --- Auto-open on #/customers#new --- */
  useEffect(() => {
    const handle = () => {
      if (window.location.hash.split('#').includes('new')) openCreate()
    }
    handle()
    window.addEventListener('hashchange', handle)
    return () => window.removeEventListener('hashchange', handle)
  }, [])

  /* --------------- Load (and re-load on search) --------------- */
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const data = await listCustomers(q.trim())
        if (alive) setRows(Array.isArray(data) ? data : [])
      } catch (e) {
        console.error(e)
        notify.error('Failed to load customers', e.message || 'Try again')
      }
    })()
    return () => { alive = false }
  }, [q])

  /* --------------------------- Filtering ----------------------- */
  const filtered = useMemo(() => {
    // server already filters by q; keep client-side filter for snappy UX
    let list = rows
    if (q.trim()) {
      const s = q.toLowerCase()
      list = list.filter(r =>
        (r.name || '').toLowerCase().includes(s) ||
        (r.email || '').toLowerCase().includes(s) ||
        (r.id || '').toLowerCase().includes(s)
      )
    }
    return list
  }, [rows, q])

  /* ----------------------------- CRUD ------------------------- */
  const openDelete = (row) => { setTarget(row); setConfirmOpen(true) }

  const confirmDelete = async () => {
    const id = target?.id || target?._id
    if (!id) { setConfirmOpen(false); return }
    // optimistic
    const prev = rows
    setRows(rows.filter(r => (r.id || r._id) !== id))
    setConfirmOpen(false); setTarget(null)
    try {
      await deleteCustomer(id)
      notify.error('Customer deleted', `Removed ${id}`)
    } catch (e) {
      setRows(prev)
      notify.error('Delete failed', e.message || 'Try again')
    }
  }

  const openCreate = () => {
    setFormInitial({ id: genCustomerId(), name: '', email: '', phone: '', address: '' })
    setFormErrors({})
    setFormOpen(true)
  }

  const openEdit = (row) => {
    setFormInitial({ ...row })
    setFormErrors({})
    setFormOpen(true)
  }

  const submitForm = async () => {
    const errors = validateCustomer(formInitial || {})
    setFormErrors(errors)
    if (Object.keys(errors).length) return

    const isEdit = !!rows.find(r => (r.id || r._id) === (formInitial.id || formInitial._id))
    const p = isEdit
      ? updateCustomer(formInitial.id || formInitial._id, formInitial)
      : createCustomer(formInitial)

    notify.promise(p, {
      pending: { title: isEdit ? 'Saving…' : 'Adding customer…' },
      success: (res) => ({ title: isEdit ? 'Updated ✅' : 'Created 🎉', message: res.name }),
      error:   (err) => ({ title: 'Failed ❌', message: err?.message || '' })
    })

    try {
      const res = await p
      const key = res.id || res._id
      const idx = rows.findIndex(r => (r.id || r._id) === key)
      const next = [...rows]
      if (idx >= 0) next[idx] = res; else next.unshift(res)
      setRows(next)
      setFormOpen(false)
    } catch (e) {
      console.error(e)
    }
  }

  /* ------------------------------ UI -------------------------- */
  return (
    <Page title="Customers" subtitle="Manage your customer records" actions={<Btn onClick={openCreate}>+ Add Customer</Btn>}>
      <div className="flex flex-wrap gap-3">
        <input
          className="w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none
                     focus:ring-2 focus:ring-emerald-400"
          placeholder="Search name/email/id"
          value={q}
          onChange={(e)=>setQ(e.target.value)}
        />
      </div>

      <TableWrap>
        <DataTable
          empty="No customers"
          columns={[
            { key: 'id', header: 'ID', render: (r) => r.id || r._id },
            { key: 'name', header: 'Name' },
            { key: 'email', header: 'Email' },
            { key: 'phone', header: 'Phone' },
            { key: '_actions', header: 'Actions', align: 'right',
              render: (r)=>(
                <div className="flex justify-end gap-2">
                  <BtnGhost onClick={()=>openEdit(r)}>Edit</BtnGhost>
                  <BtnDanger onClick={()=>openDelete(r)}>Delete</BtnDanger>
                </div>
              )
            }
          ]}
          rows={filtered}
        />
      </TableWrap>

      <SweetAlert
        open={confirmOpen}
        title="Delete customer?"
        message={`Remove ${target?.name}?`}
        confirmText="Delete"
        cancelText="Cancel"
        tone="rose"
        onConfirm={confirmDelete}
        onCancel={()=>setConfirmOpen(false)}
      />

      <SweetAlert
        open={formOpen}
        title={formInitial?.id ? 'Edit customer' : 'New customer'}
        confirmText={formInitial?.id ? 'Save' : 'Create'}
        cancelText="Cancel"
        tone="emerald"
        onConfirm={submitForm}
        onCancel={()=>setFormOpen(false)}
      >
        {formInitial && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer ID">
              <input className={inClass()} value={formInitial.id || ''} readOnly />
            </Field>
            <Field label="Name" error={formErrors.name}>
              <input className={inClass(formErrors.name)} value={formInitial.name}
                onChange={(e)=>setFormInitial({ ...formInitial, name: e.target.value })}/>
            </Field>
            <Field label="Email" error={formErrors.email}>
              <input className={inClass(formErrors.email)} value={formInitial.email}
                onChange={(e)=>setFormInitial({ ...formInitial, email: e.target.value })}/>
            </Field>
            <Field label="Phone">
              <input className={inClass()} value={formInitial.phone || ''}
                onChange={(e)=>setFormInitial({ ...formInitial, phone: e.target.value })}/>
            </Field>
            <Field label="Address">
              <input className={inClass()} value={formInitial.address || ''}
                onChange={(e)=>setFormInitial({ ...formInitial, address: e.target.value })}/>
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
