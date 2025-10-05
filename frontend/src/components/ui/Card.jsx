// src/components/ui/Card.jsx
import React from 'react'

function cx(...a){ return a.filter(Boolean).join(' ') }

export function Card({ className = '', children, variant = 'elevated', clickable = false, onClick }) {
  const frame =
    variant === 'subtle'
      ? 'bg-gradient-to-br from-slate-100 via-white to-slate-100 shadow-[0_2px_14px_rgba(15,23,42,.06)]'
      : 'bg-gradient-to-br from-slate-200 via-white to-slate-200 shadow-[0_6px_28px_rgba(15,23,42,.10)]'
  return (
    <div
      className={cx(
        'rounded-2xl p-[1px] transition-all',
        frame,
        clickable && 'cursor-pointer hover:-translate-y-[1px]',
        'hover:shadow-[0_10px_36px_rgba(15,23,42,.14)]',
        className
      )}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      <div className="rounded-2xl bg-white relative">
        {/* subtle top gleam */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-8 rounded-t-2xl
                        bg-gradient-to-b from-slate-50/90 to-transparent" />
        {children}
      </div>
    </div>
  )
}

export function CardHeader({ icon, title, subtitle, actions }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl
                          bg-slate-50 text-slate-600 ring-1 ring-slate-200">
            {icon}
          </div>
        )}
        <div>
          <div className="text-[15px] leading-tight font-semibold text-slate-900">{title}</div>
          {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
        </div>
      </div>
      {actions}
    </div>
  )
}

export const CardBody = ({ className = '', children }) =>
  <div className={cx('px-4 pb-4', className)}>{children}</div>

export const Divider = () => <div className="mx-4 my-2 h-px bg-slate-100" />

export const StatRow = ({ label, value, hint }) => (
  <div className="flex items-baseline justify-between py-1.5">
    <div className="text-[13px] text-slate-600">{label}</div>
    <div className="text-[13px] font-medium text-slate-900">
      {value}{hint && <span className="ml-2 text-xs text-slate-500">{hint}</span>}
    </div>
  </div>
)

export const DeltaPill = ({ delta, good = true }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs
                    ${good ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                           : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'}`}>
    <span className="leading-none">{good ? '▲' : '▼'}</span>
    {delta}
  </span>
)

export default Card
