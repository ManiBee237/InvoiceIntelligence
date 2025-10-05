// src/components/Header.jsx
import React, { useEffect, useState } from 'react'

/* SVG logo (no image assets) */
function BrandLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-label="Invoice AI">
      <defs>
        <linearGradient id="lg-a" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
        <linearGradient id="lg-b" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.45)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="10" fill="url(#lg-a)" />
      <rect x="2" y="2" width="44" height="22" rx="10" fill="url(#lg-b)" />
      <g stroke="white" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 14 h14 a3 3 0 0 1 3 3 v15 l-4-2 -4 2 -4-2 -4 2 v-15 a3 3 0 0 1 3-3 z" />
        <path d="M18 19 h12" />
        <path d="M18 24 h12" />
      </g>
      <path d="M26 33 l3 3 7-7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function getInitials(name = '') {
  const n = String(name).trim()
  if (!n) return 'U'
  const parts = n.split(/\s+/).slice(0, 2)
  return parts.map(p => p[0]?.toUpperCase() || '').join('') || 'U'
}

function readDisplayFromStorage() {
  // Prefer explicit keys set by auth APIs
  const storedName  = localStorage.getItem('userName') || ''
  const storedEmail = localStorage.getItem('userEmail') || ''
  if (storedName) return { name: storedName, email: storedEmail }

  // Fallback: parse our "auth" blob (from Login.jsx)
  try {
    const auth = JSON.parse(localStorage.getItem('auth') || '{}')
    const email = storedEmail || auth.email || ''
    const name  = auth.name || ''
    return { name, email }
  } catch {
    return { name: '', email: '' }
  }
}

export default function Header({ username: propUsername }) {
  const [{ name, email }, setUser] = useState(() => readDisplayFromStorage())

  useEffect(() => {
    // update if another part of the app sets localStorage after login
    const onStorage = (e) => {
      if (!e || ['userName', 'userEmail', 'auth'].includes(e.key)) {
        setUser(readDisplayFromStorage())
      }
    }
    window.addEventListener('storage', onStorage)
    // also poll once after mount (helps immediately after login redirect)
    const t = setTimeout(() => setUser(readDisplayFromStorage()), 50)
    return () => { window.removeEventListener('storage', onStorage); clearTimeout(t) }
  }, [])

  const display = propUsername || name || (email ? email.split('@')[0] : 'User')
  const initials = getInitials(name || display)

  return (
    <header
      id="topbar"
      className="fixed top-0 left-0 right-0 z-40 h-16 md:h-20 flex items-center justify-between px-5 md:px-6
                 text-white bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-800 overflow-hidden"
    >
      {/* thin gradient line on very top */}
      <div className="absolute left-0 right-0 top-0 h-[4px] bg-gradient-to-r from-emerald-500 via-teal-400 to-sky-500" />

      {/* subtle texture */}
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(circle at 1px 1px, rgba(255,255,255,0.12) 1px, transparent 1px),
            linear-gradient(135deg, rgba(255,255,255,0.04), rgba(0,0,0,0) 45%)
          `,
          backgroundSize: '10px 10px, 100% 100%'
        }}
      />

      {/* left side brand */}
      <div className="flex items-center gap-3 z-10">
        <BrandLogo size={34} />
        <div className="leading-tight">
          <div className="font-semibold tracking-wide text-base md:text-lg">Invoice AI</div>
          <div className="text-xs text-slate-300">Billing • AR • Insights</div>
        </div>
      </div>

      {/* right side profile + username */}
      <div className="flex items-center gap-3 z-[999]">
        <span className="hidden md:block text-sm text-slate-200 max-w-[32ch] truncate">{display}</span>
        <div
          className="flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-sky-500 text-white text-sm font-bold"
          title={display}
          aria-label={display}
        >
          {initials}
        </div>
      </div>
    </header>
  )
}
