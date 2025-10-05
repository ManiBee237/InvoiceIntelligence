// src/pages/Products.jsx
import React, { useMemo, useState, useEffect } from 'react'
import Page from '../components/Page'
import { TableWrap, DataTable } from '../components/ui/Table'
import { Btn, BtnGhost, BtnDanger } from '../components/ui/Buttons'
import SweetAlert from '../components/ui/SweetAlert'
import { notify } from '../components/ui/Toast'
import { inr } from '../data/store'
import { api } from '../lib/api'

function validateProduct(values) {
  const errors = {}
  if (!values.name) errors.name = 'Name required'
  if (values.price == null || Number(values.price) <= 0) errors.price = 'Price must be > 0'
  return errors
}

const listProducts  = async (q='') => api(`/api/products${q ? `?q=${encodeURIComponent(q)}` : ''}`)
const createProduct = async (body) => api('/api/products', { method: 'POST', body })
const updateProduct = async (id, body) => api(`/api/products/${encodeURIComponent(id)}`, { method: 'PUT', body })
const deleteProduct = async (id) => api(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' })

const genProdId = () => `PR-${Date.now().toString().slice(-6)}`

export default function Products() {
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [target, setTarget] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formInitial, setFormInitial] = useState(null)
  const [formErrors, setFormErrors] = useState({})

  // load + search
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const data = await listProducts(q.trim())
        if (alive) setRows(Array.isArray(data) ? data : [])
      } catch (e) {
        console.error(e)
        notify.error('Failed to load products', e.message || 'Try again')
      }
    })()
    return () => { alive = false }
  }, [q])

  const filtered = useMemo(() => {
    let list = rows
    if (q.trim()) {
      const s = q.toLowerCase()
      list = list.filter(r =>
        (r.name || '').toLowerCase().includes(s) ||
        (r.id || '').toLowerCase().includes(s)
      )
    }
    return list
  }, [rows, q])

  const openDelete = (row) => { setTarget(row); setConfirmOpen(true) }
  const confirmDelete = async () => {
    const id = target?.id || target?._id
    if (!id) return setConfirmOpen(false)
    const prev = rows
    setRows(rows.filter(r => (r.id || r._id) !== id))
    setConfirmOpen(false); setTarget(null)
    try {
      await deleteProduct(id)
      notify.error('Product deleted', `Removed ${id}`)
    } catch (e) {
      setRows(prev)
      notify.error('Delete failed', e.message || 'Try again')
    }
  }

  const openCreate = () => {
    setFormInitial({ id: genProdId(), name: '', price: '', stock: 0, gstPct: 0, sku: '' })
    setFormErrors({})
    setFormOpen(true)
  }
  const openEdit = (row) => { setFormInitial({ ...row }); setFormErrors({}); setFormOpen(true) }

  const submitForm = async () => {
    const errors = validateProduct(formInitial || {})
    setFormErrors(errors)
    if (Object.keys(errors).length) return

    const isEdit = !!rows.find(r => (r.id || r._id) === (formInitial.id || formInitial._id))
    const p = isEdit
      ? updateProduct(formInitial.id || formInitial._id, formInitial)
      : createProduct(formInitial)

    notify.promise(p, {
      pending: { title: isEdit ? 'Saving…' : 'Adding product…' },
      success: (res) => ({ title: isEdit ? 'Updated ✅' : 'Created 🎉', message: res.name }),
      error: (err) => ({ title: 'Failed ❌', message: err?.message || '' })
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

  // ✅ correct modal title logic
  const isEditing =
    !!(formInitial?.id || formInitial?._id) &&
    rows.some(r => (r.id || r._id) === (formInitial?.id || formInitial?._id))

  return (
    <Page title="Products" subtitle="Manage your product catalog" actions={<Btn onClick={openCreate}>+ Add Product</Btn>}>
      <div className="flex flex-wrap gap-3">
        <input
          className="w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
          placeholder="Search name or ID"
          value={q}
          onChange={(e)=>setQ(e.target.value)}
        />
      </div>

      <TableWrap>
        <DataTable
          empty="No products"
          columns={[
            { key: 'id', header: 'ID', render: (r)=> r.id || r._id },
            { key: 'name', header: 'Name' },
            { key: 'sku', header: 'SKU' },
            { key: 'price', header: 'Price', align: 'right', render: (r)=> inr(Number(r.price)||0) },
            { key: 'gstPct', header: 'GST %', align: 'right', render: (r)=> `${Number(r.gstPct||0)}%` },
            { key: 'stock', header: 'Stock', align: 'right' },
            { key: '_actions', header: 'Actions', align: 'right',
              render: (r)=>(
                <div className="flex justify-end gap-2">
                  <BtnGhost onClick={()=>openEdit(r)}>Edit</BtnGhost>
                  <BtnDanger onClick={()=>openDelete(r)}>Delete</BtnDanger>
                </div>
              )}
          ]}
          rows={filtered}
        />
      </TableWrap>

      {/* ✅ Product create/edit modal (not invoice) */}
      <SweetAlert
        open={formOpen}
        title={isEditing ? 'Edit product' : 'New product'}
        confirmText={isEditing ? 'Save' : 'Create'}
        cancelText="Cancel"
        tone="emerald"
        onConfirm={submitForm}
        onCancel={()=>setFormOpen(false)}
      >
        {formInitial && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Product ID">
              <input className={inClass()} value={formInitial.id || ''} readOnly />
            </Field>
            <Field label="Name" error={formErrors.name}>
              <input
                className={inClass(formErrors.name)}
                value={formInitial.name}
                onChange={(e)=>setFormInitial({ ...formInitial, name: e.target.value })}
              />
            </Field>
            <Field label="Price (₹)" error={formErrors.price}>
              <input
                type="number"
                className={inClass(formErrors.price)}
                value={formInitial.price}
                onChange={(e)=>setFormInitial({ ...formInitial, price: Number(e.target.value) })}
              />
            </Field>
            <Field label="GST (%)">
              <input
                type="number"
                className={inClass()}
                value={formInitial.gstPct ?? 0}
                onChange={(e)=>setFormInitial({ ...formInitial, gstPct: Number(e.target.value) })}
              />
            </Field>
            <Field label="SKU">
              <input
                className={inClass()}
                value={formInitial.sku || ''}
                onChange={(e)=>setFormInitial({ ...formInitial, sku: e.target.value })}
              />
            </Field>
            <Field label="Stock">
              <input
                type="number"
                className={inClass()}
                value={formInitial.stock ?? 0}
                onChange={(e)=>setFormInitial({ ...formInitial, stock: Number(e.target.value) })}
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
