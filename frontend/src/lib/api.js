// src/lib/api.js
export async function api(path, opts = {}) {
  const base = import.meta.env.VITE_API || 'http://localhost:4000'
  const tenant   = localStorage.getItem('tenant')   || sessionStorage.getItem('tenant')
  const tenantId = localStorage.getItem('tenantId') || sessionStorage.getItem('tenantId')
  const user     = localStorage.getItem('user')     || sessionStorage.getItem('user')
  const token    = localStorage.getItem('token')    || sessionStorage.getItem('token')

  const headers = {
    'Content-Type': 'application/json',
    ...(tenantId || tenant ? { 'x-tenant-id': tenantId || tenant } : {}),
    ...(user ? { 'x-user-id': user } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers || {}),
  }

  const res = await fetch(`${base}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'include',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let msg = text
    try { msg = JSON.parse(text).error || msg } catch {}
    throw new Error(msg || res.statusText)
  }
  try { return await res.json() } catch { return null }
}
