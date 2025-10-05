// src/components/ui/Buttons.jsx
import React from 'react'
const cx = (...a) => a.filter(Boolean).join(' ')

export const Btn = ({ children, className='', ...p }) => (
  <button
    {...p}
    className={cx(
      'inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white',
      'hover:bg-emerald-500 active:translate-y-[0.5px] transition',
      className
    )}
  >{children}</button>
)

export const BtnGhost = ({ children, className='', ...p }) => (
  <button
    {...p}
    className={cx(
      'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700',
      'hover:bg-slate-50 active:translate-y-[0.5px] transition',
      className
    )}
  >{children}</button>
)

export const BtnDanger = ({ children, className='', ...p }) => (
  <button
    {...p}
    className={cx(
      'inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white',
      'hover:bg-rose-500 active:translate-y-[0.5px] transition',
      className
    )}
  >{children}</button>
)
