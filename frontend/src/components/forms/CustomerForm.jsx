// src/components/forms/CustomerForm.jsx
import React, { useState } from 'react'
import Input from '../ui/Input'
import Button, { Secondary } from '../ui/Button'

export default function CustomerForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => initial || { name:'', email:'', phone:'' })
  const set = (k,v)=> setForm(f=>({...f,[k]:v}))
  return (
    <form onSubmit={(e)=>{e.preventDefault(); onSubmit?.(form)}} className="space-y-3">
      <div className="grid md:grid-cols-3 gap-3">
        <div><label className="block text-xs text-slate-500 mb-1">Name</label>
          <Input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="Acme Pvt Ltd" />
        </div>
        <div><label className="block text-xs text-slate-500 mb-1">Email</label>
          <Input type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="billing@acme.com" />
        </div>
        <div><label className="block text-xs text-slate-500 mb-1">Phone</label>
          <Input value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="+91 98xxxxxxx" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Secondary type="button" onClick={onCancel}>Cancel</Secondary>
        <Button type="submit">Save Customer</Button>
      </div>
    </form>
  )
}
