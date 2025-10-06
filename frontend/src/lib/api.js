// src/lib/api.js
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

function readAuth() {
  try { return JSON.parse(localStorage.getItem('auth') || '{}'); }
  catch { return {}; }
}

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const auth   = readAuth();
  const token  = auth?.token;
  // Prefer tenant from auth; fall back to a manual localStorage key; finally 'demo' in dev.
  const tenant = auth?.tenant?._id || auth?.tenant?.slug || localStorage.getItem('tenant') || 'demo';
  const userId = auth?.user?._id;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token  ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenant ? { 'x-tenant-id': tenant } : {}),
      ...(userId ? { 'x-user-id': userId } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const ct = res.headers.get('content-type') || '';
  const parseJSON = () => ct.includes('application/json') ? res.json() : res.text();

  if (!res.ok) {
    const err = await parseJSON().catch(() => ({}));
    const msg = (err && err.error) || res.statusText || 'Request failed';
    throw new Error(msg);
  }
  return parseJSON();
}
