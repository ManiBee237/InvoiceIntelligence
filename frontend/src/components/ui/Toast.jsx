// src/components/ui/Toast.jsx
import React from 'react'
import { ToastContainer, toast, Slide } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

/* ----------------------------- Visual helpers ---------------------------- */
const toneMap = {
  success: {
    icon: '✅',
    ring: 'ring-emerald-200',
    bg: 'bg-gradient-to-br from-emerald-600 to-emerald-500',
    text: 'text-white',
    button:
      'bg-white/10 hover:bg-white/20 text-white border border-white/20',
  },
  error: {
    icon: '⛔',
    ring: 'ring-rose-200',
    bg: 'bg-gradient-to-br from-rose-600 to-rose-500',
    text: 'text-white',
    button:
      'bg-white/10 hover:bg-white/20 text-white border border-white/20',
  },
  info: {
    icon: 'ℹ️',
    ring: 'ring-sky-200',
    bg: 'bg-gradient-to-br from-sky-600 to-sky-500',
    text: 'text-white',
    button:
      'bg-white/10 hover:bg-white/20 text-white border border-white/20',
  },
  warn: {
    icon: '⚠️',
    ring: 'ring-amber-200',
    bg: 'bg-gradient-to-br from-amber-600 to-amber-500',
    text: 'text-white',
    button:
      'bg-white/10 hover:bg-white/20 text-white border border-white/20',
  },
}

/* ------------------------------ Toast Card UI --------------------------- */
function ToastCard({ id, variant = 'success', title, message, action }) {
  const tone = toneMap[variant] || toneMap.success
  return (
    <div
      className={[
        'min-w-[280px] max-w-[420px] rounded-xl p-[1px] ring-1',
        tone.ring,
      ].join(' ')}
    >
      <div
        className={[
          'rounded-xl px-3.5 py-3 flex items-start gap-3',
          tone.bg,
          tone.text,
        ].join(' ')}
      >
        <div className="text-lg leading-none">{tone.icon}</div>
        <div className="flex-1">
          {title && (
            <div className="text-[14px] font-semibold leading-snug">
              {title}
            </div>
          )}
          {message && (
            <div className="text-[13px] opacity-95">{message}</div>
          )}
          {action && (
            <div className="mt-2">
              <button
                onClick={() => {
                  try { action.onClick?.(); } finally { toast.dismiss(id) }
                }}
                className={[
                  'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px]',
                  'transition',
                  tone.button,
                ].join(' ')}
              >
                {action.label}
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => toast.dismiss(id)}
          className="opacity-80 hover:opacity-100 transition leading-none"
          aria-label="Close"
          title="Close"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

/* ------------------------------ Defaults/Host --------------------------- */
export const toastOptions = {
  position: 'top-right',
  autoClose: 3200,
  hideProgressBar: true,      // cleaner with our custom UI
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
  newestOnTop: true,
  theme: 'light',
  transition: Slide,
  icon: false,                // we render our own icon
  closeButton: false,         // we render our own close
  bodyClassName: () => 'p-0', // remove default padding
}

export function ToastHost(props) {
  return (
    <ToastContainer
      {...toastOptions}
      {...props}
      // subtle spacing between toasts
      style={{ zIndex: 9999 }}
      toastStyle={{ background: 'transparent', boxShadow: 'none' }}
    />
  )
}

/* --------------------------------- API ---------------------------------- */
// All helpers render the same ToastCard with different tones.
// Usage: notify.success('Saved', 'Invoice INV-1001 created', { action: { label:'View', onClick(){ location.hash="#/invoices" } } })
function baseShow(variant, title, message, opts = {}) {
  return toast((t) => (
    <ToastCard
      id={t.id}
      variant={variant}
      title={title}
      message={message}
      action={opts.action}
    />
  ), { ...toastOptions, ...opts })
}

export const notify = {
  success: (title, message, opts) => baseShow('success', title, message, opts),
  error:   (title, message, opts) => baseShow('error',   title, message, opts),
  info:    (title, message, opts) => baseShow('info',    title, message, opts),
  warn:    (title, message, opts) => baseShow('warn',    title, message, opts),

  // Promise helper with pretty states
  promise: (promise, { pending, success, error }, opts = {}) =>
    toast.promise(
      promise,
      {
        pending: {
          render({ data, toastProps }) {
            return (
              <ToastCard id={toastProps.toastId} variant="info" title={pending?.title || 'Working…'} message={pending?.message || ''} />
            )
          },
        },
        success: {
          render({ data, toastProps }) {
            const t = typeof success === 'function' ? success(data) : success
            return (
              <ToastCard id={toastProps.toastId} variant="success" title={t?.title || 'Done ✅'} message={t?.message || ''} />
            )
          },
        },
        error: {
          render({ data, toastProps }) {
            const t = typeof error === 'function' ? error(data) : error
            return (
              <ToastCard id={toastProps.toastId} variant="error" title={t?.title || 'Failed'} message={t?.message || (data?.message || '')} />
            )
          },
        },
      },
      { ...toastOptions, ...opts }
    ),
}

export default ToastHost
