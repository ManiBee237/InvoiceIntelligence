// src/pages/Settings.jsx
import React, { useState, useEffect } from 'react'
import Page from '../components/Page'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import { Btn, BtnGhost } from '../components/ui/Buttons'
import { notify } from '../components/ui/Toast'

export default function Settings() {
  // simple local prefs (persist to localStorage)
  const [prefs, setPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('prefs') || '{}') } catch { return {} }
  })

  useEffect(() => {
    localStorage.setItem('prefs', JSON.stringify(prefs))
  }, [prefs])

  const inClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400'

  const onSave = () => {
    localStorage.setItem('prefs', JSON.stringify(prefs))
    notify.success('Settings saved', 'Your preferences have been updated')
  }

  const onLogout = () => {
    // clear any faux auth + ephemeral data you stored
    try { localStorage.removeItem('auth'); } catch {}
    notify.info('Signed out', 'See you soon!')
    window.location.hash = '#/login'
  }

  return (
    <Page
      title="Settings"
      subtitle="Manage your account and application preferences"
      actions={<Btn onClick={onSave}>Save changes</Btn>}
    >
      {/* Account */}
      <Card>
        <CardHeader title="Account" subtitle="Profile information (local only)" />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <div className="text-xs text-slate-600 mb-1">Business name</div>
              <input className={inClass} value={prefs.bizName || ''} onChange={(e)=>setPrefs({...prefs, bizName: e.target.value})}/>
            </label>
            <label className="block">
              <div className="text-xs text-slate-600 mb-1">Email for invoices</div>
              <input className={inClass} type="email" value={prefs.email || ''} onChange={(e)=>setPrefs({...prefs, email: e.target.value})}/>
            </label>
            <label className="block">
              <div className="text-xs text-slate-600 mb-1">GSTIN</div>
              <input className={inClass} value={prefs.gstin || ''} onChange={(e)=>setPrefs({...prefs, gstin: e.target.value})}/>
            </label>
            <label className="block">
              <div className="text-xs text-slate-600 mb-1">Default currency</div>
              <select className={inClass} value={prefs.ccy || 'INR'} onChange={(e)=>setPrefs({...prefs, ccy: e.target.value})}>
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </label>
          </div>
        </CardBody>
      </Card>

      {/* Preferences */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Preferences" subtitle="UI & behavior" />
          <CardBody>
            <div className="space-y-3 text-sm">
              <label className="flex items-center justify-between gap-3">
                <span>Compact tables</span>
                <input type="checkbox" checked={!!prefs.compact} onChange={(e)=>setPrefs({...prefs, compact: e.target.checked})}/>
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>Show tooltips</span>
                <input type="checkbox" checked={!!prefs.tooltips} onChange={(e)=>setPrefs({...prefs, tooltips: e.target.checked})}/>
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>Enable sounds</span>
                <input type="checkbox" checked={!!prefs.sounds} onChange={(e)=>setPrefs({...prefs, sounds: e.target.checked})}/>
              </label>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Security" subtitle="Local session options" />
          <CardBody>
            <div className="space-y-3 text-sm">
              <label className="flex items-center justify-between gap-3">
                <span>Auto-lock after inactivity</span>
                <select
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                  value={prefs.autolock || 'never'}
                  onChange={(e)=>setPrefs({...prefs, autolock: e.target.value})}
                >
                  <option value="never">Never</option>
                  <option value="5">5 minutes</option>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                </select>
              </label>

              <div className="pt-2 border-t border-slate-100" />

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-900">Logout</div>
                  <div className="text-xs text-slate-600">Sign out and go to the login page</div>
                </div>
                <BtnGhost onClick={onLogout}>Logout</BtnGhost>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </Page>
  )
}
