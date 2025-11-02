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

// lib/api.js
export async function api(url, opts = {}) {
  const base = import.meta.env.VITE_API_BASE || ""; // or ""
  const o = {
    method: opts.method || "GET",
    credentials: opts.credentials ?? "include", // include cookies by default if you want sessions
    headers: Object.assign({}, opts.headers || {}),
  };

  // If caller provided a body as an object, stringify + set content-type
  if (opts.body !== undefined && typeof opts.body === "object" && !(opts.body instanceof FormData)) {
    o.headers["Content-Type"] = o.headers["Content-Type"] || "application/json";
    o.body = JSON.stringify(opts.body);
  } else if (opts.body !== undefined) {
    // body is already a string or FormData
    o.body = opts.body;
  }

  // If the caller passed tenant in opts.tenant or opts.body.tenant, set x-tenant-id header
  const tenant =
    opts.headers?.["x-tenant-id"] ||
    opts.headers?.["X-Tenant-Id"] ||
    opts.tenant ||
    (opts.body && opts.body.tenant) ||
    localStorage.getItem("tenant") ||
    null;

  if (tenant) {
    o.headers["x-tenant-id"] = tenant;
  }

  const resp = await fetch(base + url, o);

  // helpful: try to parse JSON response; else give clearer error
  const text = await resp.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Invalid JSON response (status ${resp.status})`);
  }

  if (!resp.ok) {
    const msg = data.error || data.message || `Request failed: ${resp.status}`;
    const err = new Error(msg);
    err.status = resp.status;
    err.body = data;
    throw err;
  }

  return data;
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
