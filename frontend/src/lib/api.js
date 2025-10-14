// src/lib/api.js
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

function readAuth() {
  try { return JSON.parse(localStorage.getItem('auth') || '{}'); }
  catch { return {}; }
}

// optional helpers to set/get tenant quickly
export function setTenant(slug) {
  localStorage.setItem('tenant', slug);
}
export function getTenant() {
  const auth = readAuth();
  return auth?.tenant?._id || auth?.tenant?.slug || localStorage.getItem('tenant') || 'demo';
}

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const auth   = readAuth();
  const token  = auth?.token;
  const tenant = getTenant();           // <-- uses helper
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
      headers: tenant ? { 'x-tenant-id': tenant } : undefined,
    }),
  createCustomer: (tenant, doc) =>
    api('/api/customers', { method: 'POST', body: doc, headers: tenant ? { 'x-tenant-id': tenant } : undefined }),

  // Invoices
  listInvoices: (tenant, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api(`/api/invoices${qs ? `?${qs}` : ''}`, {
      headers: tenant ? { 'x-tenant-id': tenant } : undefined,
    });
  },
  createInvoice: (tenant, doc) =>
    api('/api/invoices', { method: 'POST', body: doc, headers: tenant ? { 'x-tenant-id': tenant } : undefined }),

  // Products
  listProducts: (tenant, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api(`/api/products${qs ? `?${qs}` : ''}`, {
      headers: tenant ? { 'x-tenant-id': tenant } : undefined,
    });
  },
  createProduct: (tenant, doc) =>
    api('/api/products', { method: 'POST', body: doc, headers: tenant ? { 'x-tenant-id': tenant } : undefined }),

  // Bootstrap
  bootstrap: (tenant) =>
    api('/api/bootstrap', { headers: tenant ? { 'x-tenant-id': tenant } : undefined }),
};
