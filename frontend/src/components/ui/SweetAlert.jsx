// src/components/ui/SweetAlert.jsx
import React, { useEffect } from 'react'

export default function SweetAlert({
  open,
  title = 'Are you sure?',
  message = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  tone = 'rose',         // 'emerald' | 'sky' | 'amber' | 'rose'
  onConfirm,
  onCancel,
  children,             // optional custom content (e.g., form)
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (!open) return
      if (e.key === 'Escape') onCancel?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const t = (c) => ({
    ring:  `ring-1 ring-${c}-200`,
    btn:   `bg-${c}-600 hover:bg-${c}-500`,
    pale:  `bg-${c}-50 text-${c}-700`,
  })

  const tp = tone === 'emerald' ? t('emerald')
           : tone === 'sky'     ? t('sky')
           : tone === 'amber'   ? t('amber')
           : t('rose')

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/40" onClick={onCancel} />
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
        <div className={`w-full max-w-md rounded-2xl bg-white shadow-2xl ${tp.ring} animate-[pop_.12s_ease-out]`}>
          <div className="px-5 pt-5 pb-2">
            <div className="flex items-start gap-3">
              <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${tp.pale}`}>
                ⚠️
              </div>
              <div>
                <div className="text-[15px] font-semibold text-slate-900">{title}</div>
                {message && <div className="text-sm text-slate-600 mt-1">{message}</div>}
              </div>
            </div>

            {/* custom content (form, etc.) */}
            {children && <div className="mt-4">{children}</div>}
          </div>

          <div className="px-5 pb-5 pt-2 flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className={`rounded-lg px-3 py-2 text-sm text-white ${tp.btn}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>

      {/* tiny pop animation */}
      <style>{`
        @keyframes pop { from { transform: scale(.98); opacity:.8 } to { transform: scale(1); opacity:1 } }
      `}</style>
    </>
  )
}
