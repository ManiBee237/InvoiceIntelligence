// src/lib/api.js
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

function readAuth() {
  try { return JSON.parse(localStorage.getItem('auth') || '{}'); }
  catch { return {}; }
}

/** Persist/override the active tenant slug (lowercased) */
export function setTenant(slug) {
  if (!slug) return;
  localStorage.setItem('tenant', String(slug).trim().toLowerCase());
}

/** Get the active tenant *slug* (never an _id). */
export function getTenant() {
  const auth = readAuth();
  // Prefer slug from auth payload if present
  const slugFromAuth =
    (auth?.tenant?.slug && String(auth.tenant.slug).trim().toLowerCase()) || null;

  // Fall back to localStorage
  const slugFromStorage =
    (localStorage.getItem('tenant') && String(localStorage.getItem('tenant')).trim().toLowerCase()) || null;

  // Final fallback: set nothing (so server returns a clear 400 instead of silently using a wrong tenant)
  const slug = slugFromAuth || slugFromStorage || '';

  return slug;
}

/**
 * Optional helper to call *after successful login/register*.
 * Pass the API response you store in localStorage as `auth`.
 * It extracts and persists the tenant slug so subsequent calls work.
 */
export function setTenantFromAuth(auth) {
  try {
    const slug =
      (auth?.tenant?.slug && String(auth.tenant.slug).trim().toLowerCase()) || null;
    if (slug) setTenant(slug);
  } catch {}
}

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const auth   = readAuth();
  const token  = auth?.token;
  const tenant = getTenant();           // <-- slug only (e.g., 'mani')
  const userId = auth?.user?._id;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token  ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenant ? { 'x-tenant-id': tenant } : {}), // always slug, lowercased
      ...(userId ? { 'x-user-id': userId } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // robust parse without double-reading
  const contentType = res.headers.get('content-type') || '';
  const isJSON = contentType.includes('application/json');
  const payload = res.status === 204 ? null : (isJSON ? await res.json().catch(() => ({})) : await res.text());

  if (!res.ok) {
    const error = new Error(
      (isJSON && payload?.error) || (typeof payload === 'string' && payload) || res.statusText || 'Request failed'
    );
    error.status = res.status;
    error.data = payload;
    error.path = path;
    throw error;
  }

  return payload;
}

// ---------- Convenience endpoints (typed-ish wrappers) ----------
export const http = {
  // Customers
  listCustomers: (tenant, { search = '', page = 1, limit = 20 } = {}) =>
    api(`/api/customers?search=${encodeURIComponent(search)}&page=${page}&limit=${limit}`, {
      headers: tenant ? { 'x-tenant-id': String(tenant).toLowerCase() } : undefined,
    }),
  createCustomer: (tenant, doc) =>
    api('/api/customers', { method: 'POST', body: doc, headers: tenant ? { 'x-tenant-id': String(tenant).toLowerCase() } : undefined }),

  // Invoices
  listInvoices: (tenant, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api(`/api/invoices${qs ? `?${qs}` : ''}`, {
      headers: tenant ? { 'x-tenant-id': String(tenant).toLowerCase() } : undefined,
    });
  },
  createInvoice: (tenant, doc) =>
    api('/api/invoices', { method: 'POST', body: doc, headers: tenant ? { 'x-tenant-id': String(tenant).toLowerCase() } : undefined }),

  // Products
  listProducts: (tenant, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api(`/api/products${qs ? `?${qs}` : ''}`, {
      headers: tenant ? { 'x-tenant-id': String(tenant).toLowerCase() } : undefined,
    });
  },
  createProduct: (tenant, doc) =>
    api('/api/products', { method: 'POST', body: doc, headers: tenant ? { 'x-tenant-id': String(tenant).toLowerCase() } : undefined }),

  // Vendors (you mentioned these)
  listVendors: (tenant, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api(`/api/vendors${qs ? `?${qs}` : ''}`, {
      headers: tenant ? { 'x-tenant-id': String(tenant).toLowerCase() } : undefined,
    });
  },
  createVendor: (tenant, doc) =>
    api('/api/vendors', { method: 'POST', body: doc, headers: tenant ? { 'x-tenant-id': String(tenant).toLowerCase() } : undefined }),

  // Bootstrap
  bootstrap: (tenant) =>
    api('/api/bootstrap', { headers: tenant ? { 'x-tenant-id': String(tenant).toLowerCase() } : undefined }),
};
