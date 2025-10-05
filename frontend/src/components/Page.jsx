// src/components/Page.jsx
import React from 'react'

export function Container({ className = '', children }) {
  // shared centered container + gutters
  return (
    <div className={`mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8 ${className}`}>
      {children}
    </div>
  )
}

export default function Page({ title, subtitle, actions, children }) {
  return (
    <Container className="py-6 lg:py-8">
      {/* header */}
      <div className="mb-4 lg:mb-6 flex items-start justify-between gap-3">
        <div>
          {title && <h1 className="text-[22px] lg:text-2xl font-semibold text-slate-900">{title}</h1>}
          {subtitle && <p className="text-slate-500 mt-1">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {/* content */}
      <div className="space-y-4 lg:space-y-6">{children}</div>
    </Container>
  )
}
