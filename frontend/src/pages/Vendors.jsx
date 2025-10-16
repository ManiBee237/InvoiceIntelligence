// src/pages/Vendors.jsx
import React, { useMemo, useState, useEffect } from 'react'
import Page from '../components/Page'
import { TableWrap, DataTable } from '../components/ui/Table'
import { Btn, BtnGhost, BtnDanger } from '../components/ui/Buttons'
import SweetAlert from '../components/ui/SweetAlert'
import { notify } from '../components/ui/Toast'
import { api } from '../lib/api'

/* --------------------------- Validation --------------------------- */
function validateVendor(values) {
  const e = {}
  if (!values.name) e.name = 'Name required'
  // if (!values.address) e.address = 'Address/City required'
  return e
}

/* ------------------------------ API ------------------------------ */
// NOTE: backend expects ?search=... (not ?q=...)
const listVendors  = async (search='') => api(`/api/vendors${search ? `?search=${encodeURIComponent(search)}` : ''}`)
const createVendor = async (body) => api('/api/vendors', { method: 'POST', body })
const updateVendor = async (id, body) => api(`/api/vendors/${encodeURIComponent(id)}`, { method: 'PUT', body })
const deleteVendor = async (id) => api(`/api/vendors/${encodeURIComponent(id)}`, { method: 'DELETE' })

// optional: create a starter bill for a new vendor
const createBill = async (body) => api('/api/bills', { method: 'POST', body })

const genVendorId = () => `VN-${Date.now().toString().slice(-6)}-${Math.floor(Math.random()*9000+1000)}`

/* -------------------------- Address helper -------------------------- */
function computeAddress(v = {}) {
  const join = (o = {}) =>
    [o.address, o.line1, o.line2, o.city, o.state, o.zip || o.pincode]
      .filter(Boolean)
      .join(', ')
  return (
    v.address ||
    v.billing?.address || join(v.billing) ||
    v.shipping?.address || join(v.shipping) ||
    ''
  )
}

// Normalize a vendor record from API for the table
function mapFromApi(v) {
  return {
    id: v.id || v._id,
    name: v.name || v.displayName || v.Name || '',
    email: v.email || '',
    phone: v.phone || '',
    gstin: v.gstin || '',
    address: computeAddress(v),          // ✅ derive display address
    isActive: v.isActive !== false,
    _raw: v,
  }
}

export default function Vendors() {
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [target, setTarget] = useState(null)

  const [formOpen, setFormOpen] = useState(false)
  const [formInitial, setFormInitial] = useState(null)
  const [formErrors, setFormErrors] = useState({})

  /* ---------------------------- Load/List ---------------------------- */
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const data = await listVendors(q.trim())
        if (alive) setRows((Array.isArray(data) ? data : []).map(mapFromApi))
      } catch (e) {
        console.error(e)
        notify.error('Failed to load vendors', e.message || 'Try again')
      }
    })()
    return () => { alive = false }
  }, [q])

  const filtered = useMemo(() => {
    // server already filters by ?search — this is just an extra guard for UX
    let list = rows
    if (q.trim()) {
      const s = q.toLowerCase()
      list = list.filter(r =>
        (r.name || '').toLowerCase().includes(s) ||
        (r.address || '').toLowerCase().includes(s) ||
        (r.id || '').toLowerCase().includes(s)
      )
    }
    return list
  }, [rows, q])

  /* ------------------------------- CRUD ------------------------------ */
  const openDelete = (row) => { setTarget(row); setConfirmOpen(true) }
  const confirmDelete = async () => {
    const id = target?.id || target?._id
    if (!id) return setConfirmOpen(false)
    const prev = rows
    setRows(rows.filter(r => (r.id || r._id) !== id))
    setConfirmOpen(false); setTarget(null)
    try {
      await deleteVendor(id)
      notify.error('Vendor deleted', `Removed ${id}`)
    } catch (e) {
      setRows(prev)
      notify.error('Delete failed', e.message || 'Try again')
    }
  }

  const openCreate = () => {
    setFormInitial({
      id: genVendorId(),        // UI code (maps to vendor.code in backend if you use it)
      name: '',
      address: '',
      email: '',
      phone: '',
      gstin: '',
    })
    setFormErrors({})
    setFormOpen(true)
  }
  const openEdit = (row) => {
    // ensure address shows in form even if only nested billing/shipping exists
    setFormInitial({ ...row, address: row.address || computeAddress(row._raw || {}) })
    setFormErrors({})
    setFormOpen(true)
  }

  const submitForm = async () => {
    const errors = validateVendor(formInitial || {})
    setFormErrors(errors)
    if (Object.keys(errors).length) return

    const isEdit = !!rows.find(r => (r.id || r._id) === (formInitial.id || formInitial._id))
    // Make sure we send a flat `address`; your backend mirrors it into billing.address
    const payload = { ...formInitial, address: formInitial.address || '' }

    const p = isEdit
      ? updateVendor(formInitial.id || formInitial._id, payload)
      : createVendor(payload)

    notify.promise(p, {
      pending: { title: isEdit ? 'Saving…' : 'Adding vendor…' },
      success: (res) => ({ title: isEdit ? 'Updated ✅' : 'Created 🎉', message: res.name }),
      error:   (err) => ({ title: 'Failed ❌', message: err?.message || '' }),
    })

    try {
      const res = await p
      const mapped = mapFromApi(res)
      const key = mapped.id
      const idx = rows.findIndex(r => (r.id || r._id) === key)
      const next = [...rows]
      if (idx >= 0) next[idx] = mapped; else next.unshift(mapped)
      setRows(next)

      // Optionally create a starter bill for new vendors (non-blocking UX)
      if (!isEdit) {
        try {
          const today = new Date()
          const due   = new Date(today.getTime() + 30*24*60*60*1000) // +30 days
          await createBill({
            id: `BILL-${Date.now().toString().slice(-6)}-${Math.floor(Math.random()*9000+1000)}`,
            vendor: mapped.name,
            date: today.toISOString().slice(0,10),
            due:  due.toISOString().slice(0,10),
            amount: 0,
            status: 'Open',
          })
          notify.info('Starter bill created', `${mapped.name} • due in 30 days`)
        } catch (e) {
          console.warn('Starter bill create failed:', e)
        }
      }

      setFormOpen(false)
    } catch (e) {
      console.error(e)
      const m = String(e.message || '').toLowerCase()
      if (m.includes('exists')) {
        notify.error('Duplicate ID', 'A vendor with this ID already exists')
      } else {
        notify.error('Failed', e.message || 'Try again')
      }
    }
  }

  const isEditing =
    !!(formInitial?.id || formInitial?._id) &&
    rows.some(r => (r.id || r._id) === (formInitial?.id || formInitial?._id))

  /* --------------------------------- UI --------------------------------- */
  return (
    <Page title="Vendors" subtitle="Manage supplier records" actions={<Btn onClick={openCreate}>+ Add Vendors</Btn>}>
      <div className="flex flex-wrap gap-3">
        <input
          className="w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
          placeholder="Search name/address"
          value={q}
          onChange={(e)=>setQ(e.target.value)}
        />
      </div>

      <TableWrap>
        <DataTable
          empty="No vendors"
          initialSort={{ key: 'name', dir: 'asc' }}
          columns={[
            { key: 'id', header: 'ID', render: (r)=> r.id || r._id },
            { key: 'name', header: 'Name' },
            // { key: 'address', header: 'Address', render: (r) => r.address || '—' },
            { key: 'email', header: 'Email' },
            { key: 'phone', header: 'Phone' },
            { key: 'gstin', header: 'GSTIN' },
            { key: '_actions', header: 'Actions', align: 'right',
              render: (r)=>(
                <div className="flex justify-end gap-2">
                  <BtnGhost onClick={()=>openEdit(r)}>Edit</BtnGhost>
                  <BtnDanger onClick={()=>openDelete(r)}>Delete</BtnDanger>
                </div>
              )},
          ]}
          rows={filtered}
        />
      </TableWrap>

      <SweetAlert
        open={confirmOpen}
        title="Delete vendor?"
        message={target ? `Remove ${target.name}?` : ''}
        confirmText="Delete"
        cancelText="Cancel"
        tone="rose"
        onConfirm={confirmDelete}
        onCancel={()=>setConfirmOpen(false)}
      />

      <SweetAlert
        open={formOpen}
        title={isEditing ? 'Edit vendor' : 'New vendor'}
        confirmText={isEditing ? 'Save' : 'Create'}
        cancelText="Cancel"
        tone="emerald"
        onConfirm={submitForm}
        onCancel={()=>setFormOpen(false)}
      >
        {formInitial && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vendor ID">
              <input className={inClass()} value={formInitial.id || ''} readOnly />
            </Field>
            <Field label="Name" error={formErrors.name}>
              <input
                className={inClass(formErrors.name)}
                value={formInitial.name}
                onChange={(e)=>setFormInitial({ ...formInitial, name: e.target.value })}
              />
            </Field>
            {/* <Field label="Address / City" error={formErrors.address}>
              <input
                className={inClass(formErrors.address)}
                value={formInitial.address || ''}
                onChange={(e)=>setFormInitial({ ...formInitial, address: e.target.value })}
              />
            </Field> */}
            <Field label="Email">
              <input
                className={inClass()}
                value={formInitial.email || ''}
                onChange={(e)=>setFormInitial({ ...formInitial, email: e.target.value })}
              />
            </Field>
            <Field label="Phone">
              <input
                className={inClass()}
                value={formInitial.phone || ''}
                onChange={(e)=>setFormInitial({ ...formInitial, phone: e.target.value })}
              />
            </Field>
            <Field label="GSTIN">
              <input
                className={inClass()}
                value={formInitial.gstin || ''}
                onChange={(e)=>setFormInitial({ ...formInitial, gstin: e.target.value })}
              />
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
