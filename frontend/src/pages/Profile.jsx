// src/pages/Profile.jsx
import React, { useEffect, useMemo, useState } from 'react'
import Page from '../components/Page'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import { Btn, BtnGhost } from '../components/ui/Buttons'
import { notify } from '../components/ui/Toast'
import { api } from '../lib/api'

function initialsFrom(name = '', email = '') {
  const n = String(name || '').trim()
  if (n) {
    const parts = n.split(/\s+/).slice(0, 2)
    const ini = parts.map(p => p[0]?.toUpperCase() || '').join('')
    if (ini) return ini
  }
  const e = String(email || '').split('@')[0] || 'U'
  return e.split(/[._-]/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('') || 'U'
}

function readLocalAuth() {
  const out = {}
  try {
    const auth = JSON.parse(localStorage.getItem('auth') || '{}')
    out.email = localStorage.getItem('userEmail') || auth.email || ''
    out.name  = localStorage.getItem('userName')  || auth.name  || ''
  } catch {}
  out.tenant      = localStorage.getItem('tenant')      || ''
  out.tenantName  = localStorage.getItem('tenantName')  || ''
  out.userId      = localStorage.getItem('userId')      || ''
  out.token       = localStorage.getItem('token')       || ''
  return out
}

export default function Profile() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [me, setMe] = useState(() => readLocalAuth())
  const [name, setName] = useState(me.name || '')
  const email = me.email || 'user@example.com'

  const initials = useMemo(() => initialsFrom(name || me.name, email), [name, me.name, email])

  // Load latest profile from backend if available
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await api('/api/auth/me')
        if (!alive) return
        // expect: { _id, name, email, tenantId, tenantName, createdAt, ... }
        const next = {
          ...me,
          name: res?.name || me.name,
          email: res?.email || me.email,
          tenant: res?.tenant || me.tenant,           // if your backend returns a tenant slug
          tenantName: res?.tenantName || me.tenantName,
          userId: res?._id || me.userId,
          createdAt: res?.createdAt,
        }
        setMe(next)
        setName(next.name || '')
        // keep localStorage in sync so Header shows it immediately elsewhere
        if (next.name)  localStorage.setItem('userName', next.name)
        if (next.email) localStorage.setItem('userEmail', next.email)
        if (next.userId) localStorage.setItem('userId', next.userId)
        if (next.tenantName) localStorage.setItem('tenantName', next.tenantName)
      } catch (e) {
        // no /api/auth/me yet or network error — just fall back to local
        console.warn('[profile] me fetch failed:', e?.message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  const onSave = async () => {
    const newName = String(name || '').trim()
    if (!newName) { notify.error('Name can’t be empty'); return }
    setSaving(true)
    try {
      // Try backend first
      const res = await api('/api/auth/me', { method: 'PUT', body: { name: newName } })
      const savedName = res?.name || newName
      setMe(m => ({ ...m, name: savedName }))
      localStorage.setItem('userName', savedName)
      notify.success('Saved', 'Profile updated')
    } catch (e) {
      // Fallback to local only if backend doesn’t support PUT yet
      console.warn('[profile] PUT /api/auth/me failed, applying local only:', e?.message)
      setMe(m => ({ ...m, name: newName }))
      localStorage.setItem('userName', newName)
      notify.info('Saved locally', 'Backend update not available yet')
    } finally {
      setSaving(false)
    }
  }

  const onLogout = () => {
    try {
      localStorage.removeItem('auth')
      localStorage.removeItem('userName')
      localStorage.removeItem('userEmail')
      localStorage.removeItem('userId')
      // keep tenant if you want to stay in same org; remove to force tenant pick on next login
      // localStorage.removeItem('tenant')
      // localStorage.removeItem('tenantName')
      localStorage.removeItem('token')
    } catch {}
    notify.info('Signed out', 'See you soon!')
    window.location.hash = '#/login'
  }

  return (
    <Page
      title="Profile"
      subtitle="Your account information"
      actions={<BtnGhost onClick={onLogout}>Logout</BtnGhost>}
    >
      {/* Account card */}
      <Card>
        <CardHeader title="Account" subtitle="Basic details" />
        <CardBody>
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-500 text-white grid place-items-center text-xl font-semibold">
                {initials}
              </div>
              <div className="text-sm">
                <div className="text-slate-900 font-medium">{email}</div>
                <div className="text-slate-600">Signed in</div>
              </div>
              <div className="grow" />
              <Btn onClick={onLogout}>Logout</Btn>
            </div>

            {/* Editable name */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <div className="text-xs text-slate-600 mb-1">Display name</div>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-slate-300 focus:ring-2 focus:ring-emerald-400"
                  placeholder="Your name"
                  value={name}
                  onChange={(e)=>setName(e.target.value)}
                  disabled={loading || saving}
                />
              </label>

              <label className="block">
                <div className="text-xs text-slate-600 mb-1">Email</div>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-slate-200 bg-slate-50"
                  value={email}
                  readOnly
                />
              </label>
            </div>

            {/* Tenant / org */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block">
                <div className="text-xs text-slate-600 mb-1">Tenant</div>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-slate-200 bg-slate-50"
                  value={me.tenant || '(not set)'}
                  readOnly
                />
              </label>
              <label className="block md:col-span-2">
                <div className="text-xs text-slate-600 mb-1">Tenant name</div>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-slate-200 bg-slate-50"
                  value={me.tenantName || '(not set)'}
                  readOnly
                />
              </label>
            </div>

            {/* IDs / Meta */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block">
                <div className="text-xs text-slate-600 mb-1">User ID</div>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-slate-200 bg-slate-50"
                  value={me.userId || '(unknown)'}
                  readOnly
                />
              </label>
              <label className="block">
                <div className="text-xs text-slate-600 mb-1">Created at</div>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-slate-200 bg-slate-50"
                  value={me.createdAt ? new Date(me.createdAt).toLocaleString() : '(unknown)'}
                  readOnly
                />
              </label>
              <label className="block">
                <div className="text-xs text-slate-600 mb-1">Auth token</div>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-slate-200 bg-slate-50"
                  value={me.token ? '••••••••' : '(none)'}
                  readOnly
                />
              </label>
            </div>

            <div className="flex gap-2">
              <Btn onClick={onSave} disabled={saving || loading}>
                {saving ? 'Saving…' : 'Save changes'}
              </Btn>
              <BtnGhost
                onClick={()=>{
                  setName(readLocalAuth().name || '')
                  notify.info('Reverted', 'Restored local values')
                }}
                disabled={saving}
              >
                Revert
              </BtnGhost>
            </div>
          </div>
        </CardBody>
      </Card>
    </Page>
  )
}
