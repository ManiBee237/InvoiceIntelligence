import React, { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'

function useDebouncedValue(value, delay = 250) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

/**
 * VendorSelect
 * Props:
 *  - initialQuery?: string
 *  - onPick: (vendor) => void          // vendor has {id,_id,name,email,phone,address,gstin}
 *  - placeholder?: string
 *  - autoFocus?: boolean
 */
export default function VendorSelect({
  initialQuery = '',
  onPick,
  placeholder = 'Search vendor…',
  autoFocus = false,
}) {
  const [query, setQuery] = useState(initialQuery)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [active, setActive] = useState(0)
  const debounced = useDebouncedValue(query, 250)
  const boxRef = useRef(null)
  const inputRef = useRef(null)

  // sync when initialQuery changes (e.g., opening existing bill)
  useEffect(() => { setQuery(initialQuery || '') }, [initialQuery])

  // fetch vendors
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        setLoading(true)
        const q = debounced.trim()
        const res = await api(`/api/vendors${q ? `?q=${encodeURIComponent(q)}` : ''}`)
        if (!alive) return
        setRows(Array.isArray(res) ? res.slice(0, 10) : [])
      } catch (e) {
        // swallow; UI toasts elsewhere if needed
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [debounced])

  // close on outside click
  useEffect(() => {
    function onDocClick(e) {
      if (!boxRef.current) return
      if (!boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const showList = open && (loading || rows.length > 0)

  const choose = (v) => {
    if (!v) return
    setQuery(v.name || '')
    setOpen(false)
    onPick?.(v)
  }

  const onKeyDown = (e) => {
    if (!showList) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, Math.max(0, rows.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(rows[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const hint = useMemo(() => {
    if (loading) return 'Searching…'
    if (!rows.length && query.trim()) return 'No vendors found'
    if (!rows.length) return 'Type to search vendors'
    return ''
  }, [loading, rows.length, query])

  return (
    <div className="relative" ref={boxRef}>
      <input
        ref={inputRef}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none border-slate-300 focus:ring-2 focus:ring-emerald-400"
        placeholder={placeholder}
        value={query}
        onChange={(e)=>{ setQuery(e.target.value); setOpen(true); setActive(0) }}
        onFocus={()=> setOpen(true)}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        aria-autocomplete="list"
        aria-expanded={showList ? 'true' : 'false'}
      />

      {/* dropdown */}
      {showList && (
        <div
          className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg"
          role="listbox"
        >
          {rows.map((r, i) => (
            <button
              key={r.id || r._id}
              type="button"
              className={[
                'w-full text-left px-3 py-2 text-sm',
                i === active ? 'bg-emerald-50' : 'hover:bg-slate-50'
              ].join(' ')}
              onMouseEnter={()=> setActive(i)}
              onClick={()=> choose(r)}
              role="option"
              aria-selected={i === active ? 'true' : 'false'}
            >
              <div className="font-medium text-slate-800">{r.name}</div>
              <div className="text-[12px] text-slate-500">
                {(r.address || '').slice(0, 80)}
                {(r.address || '').length > 80 ? '…' : ''}
              </div>
            </button>
          ))}

          {/* hint / empty row */}
          {!!hint && (
            <div className="px-3 py-2 text-[12px] text-slate-500">{hint}</div>
          )}
        </div>
      )}

      {/* quick link to add new vendor */}
      <div className="mt-1 text-[12px]">
        <a
          className="text-sky-700 hover:underline"
          href="#/vendors#new"
          onMouseDown={(e)=> e.preventDefault()}
        >
          + Add new vendor
        </a>
      </div>
    </div>
  )
}
