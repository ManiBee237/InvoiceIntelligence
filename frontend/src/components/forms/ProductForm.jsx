// src/components/forms/ProductForm.jsx
import React, { useState } from 'react'
import Input from '../ui/Input'
import Button, { Secondary } from '../ui/Button'

export default function ProductForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState(()=> initial || { name:'', sku:'', price:0, taxRate:0 })
  const set = (k,v)=> setForm(f=>({...f,[k]:v}))
  return (
    <form onSubmit={(e)=>{e.preventDefault(); onSubmit?.(form)}} className="space-y-3">
      <div className="grid md:grid-cols-4 gap-3">
        <div><label className="block text-xs text-slate-500 mb-1">Name</label>
          <Input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="A4 Copier Paper" />
        </div>
        <div><label className="block text-xs text-slate-500 mb-1">SKU</label>
          <Input value={form.sku} onChange={e=>set('sku',e.target.value)} placeholder="PAPER-A4-12" />
        </div>
        <div><label className="block text-xs text-slate-500 mb-1">Price</label>
          <Input type="number" value={form.price} onChange={e=>set('price',+e.target.value)} />
        </div>
        <div><label className="block text-xs text-slate-500 mb-1">Tax %</label>
          <Input type="number" value={form.taxRate} onChange={e=>set('taxRate',+e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Secondary type="button" onClick={onCancel}>Cancel</Secondary>
        <Button type="submit">Save Product</Button>
      </div>
    </form>
  )
}
