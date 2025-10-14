// src/pages/Bills.jsx
import React, { useEffect, useMemo, useState } from 'react';
import Page from '../components/Page';
import { TableWrap, DataTable } from '../components/ui/Table';
import { Btn, BtnGhost, BtnDanger } from '../components/ui/Buttons';
import SweetAlert from '../components/ui/SweetAlert';
import { notify } from '../components/ui/Toast';
import { inr, dd } from '../data/store';
import { api } from '../lib/api';

const STATUSES = ['draft', 'open', 'approved', 'paid', 'void'];
const isId = (s) => typeof s === 'string' && /^[a-f\d]{24}$/i.test(s);
const today = () => new Date().toISOString().slice(0, 10);

/* ---------- API ---------- */
const listBills = async () => api('/api/bills');
const createBill = async (body) => api('/api/bills', { method: 'POST', body });
const updateBill = async (id, body) => api(`/api/bills/${encodeURIComponent(id)}`, { method: 'PUT', body });
const deleteBill = async (id) => api(`/api/bills/${encodeURIComponent(id)}`, { method: 'DELETE' });
const listVendors = async () => api('/api/vendors');

/* ---------- Helpers ---------- */
const computeLine = (l) => {
  const qty  = Number(l?.qty ?? 0);
  const rate = Number(l?.rate ?? 0);
  const amount = (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(rate) ? rate : 0);
  return { description: String(l?.description ?? ''), qty: Number.isFinite(qty) ? qty : 0, rate: Number.isFinite(rate) ? rate : 0, amount };
};
const computeTotals = (lines, tax) => {
  const norm = (Array.isArray(lines) ? lines : []).map(computeLine);
  const subtotal = norm.reduce((s, x) => s + (Number.isFinite(x.amount) ? x.amount : 0), 0);
  const taxNum = Number(tax ?? 0);
  return {
    lines: norm,
    subtotal,
    tax: Number.isFinite(taxNum) ? taxNum : 0,
    total: subtotal + (Number.isFinite(taxNum) ? taxNum : 0),
  };
};
const OPEN_DEFAULT = {
  id: '',
  vendorId: '',          // dropdown
  vendorName: '',        // free text (fallback if no dropdown)
  billNo: '',
  billDate: today(),
  dueDate: '',
  lines: [{ description: '', qty: 1, rate: 0 }],
  tax: 0,
  subtotal: 0,
  total: 0,
  status: 'open',
};

export default function Bills() {
  const [rows, setRows] = useState([]);
  const [vendors, setVendors] = useState([]);

  const [q, setQ] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(OPEN_DEFAULT);
  const [errors, setErrors] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [target, setTarget] = useState(null);

  /* ---------- Load ---------- */
  useEffect(() => {
    (async () => {
      try {
        const [b, v] = await Promise.all([listBills(), listVendors().catch(() => [])]);
        setRows(Array.isArray(b) ? b : []);
        setVendors(Array.isArray(v) ? v : []);
      } catch (e) {
        console.error(e);
        notify.error('Failed to load bills', e.message || 'Try again');
      }
    })();
  }, []);

  /* ---------- Derived totals live ---------- */
  const liveTotals = useMemo(() => computeTotals(form.lines, form.tax), [form.lines, form.tax]);

  /* ---------- Filter ---------- */
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      (r.billNo || '').toLowerCase().includes(s) ||
      (r.vendorName || '').toLowerCase().includes(s) ||
      (r.status || '').toLowerCase().includes(s)
    );
  }, [rows, q]);

  /* ---------- CRUD ---------- */
  const openCreate = () => {
    setForm({ ...OPEN_DEFAULT });
    setErrors({});
    setFormOpen(true);
  };

  const openEdit = (row) => {
    setForm({
      id: row.id || row._id || '',
      vendorId: row.vendorId || '',
      vendorName: row.vendorName || '',
      billNo: row.billNo || '',
      billDate: row.billDate || today(),
      dueDate: row.dueDate || '',
      lines: Array.isArray(row.lines) && row.lines.length ? row.lines.map((l) => ({
        description: l.description || '',
        qty: Number(l.qty) || 0,
        rate: Number(l.rate) || 0,
      })) : [{ description: '', qty: 1, rate: 0 }],
      tax: Number(row.tax) || 0,
      ...computeTotals(row.lines, row.tax),
      status: String(row.status || 'open').toLowerCase(),
    });
    setErrors({});
    setFormOpen(true);
  };

  const openDelete = (row) => {
    setTarget(row);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    const id = target?.id || target?._id;
    setConfirmOpen(false);
    setTarget(null);
    if (!id) return;
    const prev = rows;
    setRows(rows.filter((r) => (r.id || r._id) !== id));
    try {
      await deleteBill(id);
      notify.error('Bill deleted', `Removed ${id}`);
    } catch (e) {
      setRows(prev);
      notify.error('Delete failed', e.message || 'Try again');
    }
  };

  /* ---------- Validation ---------- */
  const validate = () => {
    const e = {};
    const hasVendor =
      (form.vendorId && isId(form.vendorId)) ||
      (form.vendorName && String(form.vendorName).trim().length > 0);
    if (!hasVendor) e.vendor = 'Vendor is required (pick from list or type a name)';
    if (!form.billDate || Number.isNaN(Date.parse(form.billDate))) e.billDate = 'Valid date required';
    const ln = form.lines?.[0];
    if (!ln?.description) e.description = 'Description required';
    if (!(Number(ln?.qty) > 0)) e.qty = 'Qty must be > 0';
    if (!(Number(ln?.rate) > 0)) e.rate = 'Rate must be > 0';
    if (!STATUSES.includes(String(form.status || '').toLowerCase())) e.status = 'Choose status';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /* ---------- Submit ---------- */
  const submitForm = async () => {
    if (!validate()) {
      notify.error('Please fix the highlighted fields');
      return;
    }

    // Build vendor field (id preferred, else name)
    const vendorPayload =
      form.vendorId && isId(form.vendorId)
        ? { vendorId: form.vendorId }
        : { vendorName: String(form.vendorName || '').trim() };

    // Build payload
    const { lines, subtotal, tax, total } = liveTotals;
    const payload = {
      ...vendorPayload,
      billNo: form.billNo || '',
      billDate: form.billDate || today(),
      dueDate: form.dueDate || undefined,
      lines: lines.map(({ description, qty, rate }) => ({ description, qty, rate })),
      tax,
      status: String(form.status || 'open').toLowerCase(),
    };

    const isEdit = !!form.id;
    const p = isEdit ? updateBill(form.id, payload) : createBill(payload);

    notify.promise(p, {
      pending: { title: isEdit ? 'Saving changes…' : 'Creating bill…', message: 'Please wait' },
      success: (res) => ({ title: isEdit ? 'Bill updated ✅' : 'Bill created 🎉', message: res.billNo }),
      error: (err) => ({ title: 'Failed ❌', message: err?.message || 'Try again' }),
    });

    try {
      const res = await p;
      const id = res.id || res._id;
      const existingIdx = rows.findIndex((r) => (r.id || r._id) === id);
      const next = [...rows];
      if (existingIdx >= 0) next[existingIdx] = res;
      else next.unshift(res);
      setRows(next);
      setFormOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  /* ---------- UI ---------- */
  return (
    <Page
      title="Bills"
      subtitle="Track vendor bills and payables."
      actions={<Btn onClick={openCreate}>+ Add Bill</Btn>}
    >
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input
          className="w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
          placeholder="Search bill #, vendor, status"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* Table */}
      <TableWrap>
        <DataTable
          empty="No bills"
          initialSort={{ key: 'billDate', dir: 'desc' }}
          columns={[
            { key: 'billNo', header: 'Bill #' },
            { key: 'vendorName', header: 'Vendor' },
            { key: 'billDate', header: 'Date', render: (r) => dd(r.billDate) },
            { key: 'dueDate', header: 'Due', render: (r) => dd(r.dueDate) },
            { key: 'status', header: 'Status',
              render: (r) => (
                <span className={
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs border ' +
                  (r.status === 'paid'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : r.status === 'approved'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : r.status === 'void'
                    ? 'bg-slate-50 text-slate-700 border-slate-200'
                    : 'bg-sky-50 text-sky-700 border-sky-200')
                }>
                  {r.status}
                </span>
              )
            },
            { key: 'total', header: 'Total', align: 'right', render: (r) => inr(Number(r.total) || 0) },
            {
              key: '_actions', header: 'Actions', align: 'right',
              render: (r) => (
                <div className="flex justify-end gap-2">
                  <BtnGhost onClick={() => openEdit(r)}>Edit</BtnGhost>
                  <BtnDanger onClick={() => openDelete(r)}>Delete</BtnDanger>
                </div>
              )
            },
          ]}
          rows={filtered}
        />
      </TableWrap>

      {/* Delete confirm */}
      <SweetAlert
        open={confirmOpen}
        title="Delete bill?"
        message={target ? `This will permanently remove ${target.billNo || target.id}.` : ''}
        confirmText="Delete"
        cancelText="Cancel"
        tone="rose"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* Create/Edit dialog */}
      <SweetAlert
        open={formOpen}
        title={form.id ? 'Edit bill' : 'New bill'}
        message="Fill the required fields below."
        confirmText={form.id ? 'Save' : 'Create'}
        cancelText="Cancel"
        tone="emerald"
        onConfirm={submitForm}
        onCancel={() => setFormOpen(false)}
      >
        {form && (
          <div className="grid grid-cols-2 gap-3">
            {/* Vendor dropdown OR type name */}
            <Field label="Vendor" error={errors.vendor}>
              <div className="flex gap-2">
                <select
                  className={inClass(errors.vendor)}
                  value={form.vendorId ?? ''}
                  onChange={(e) => setForm({ ...form, vendorId: e.target.value, vendorName: '' })}
                >
                  <option value="">— Select —</option>
                  {vendors.map((v) => (
                    <option key={v.id || v._id} value={v.id || v._id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <input
                  className={inClass(errors.vendor)}
                  placeholder="Or type new vendor name"
                  value={form.vendorName ?? ''}
                  onChange={(e) => setForm({ ...form, vendorName: e.target.value, vendorId: '' })}
                />
              </div>
            </Field>

            <Field label="Bill #" >
              <input
                className={inClass()}
                value={form.billNo ?? ''}
                onChange={(e) => setForm({ ...form, billNo: e.target.value })}
              />
            </Field>

            <Field label="Bill date" error={errors.billDate}>
              <input
                type="date"
                className={inClass(errors.billDate)}
                value={form.billDate ?? today()}
                onChange={(e) => setForm({ ...form, billDate: e.target.value || today() })}
              />
            </Field>

            <Field label="Due date">
              <input
                type="date"
                className={inClass()}
                value={form.dueDate ?? ''}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </Field>

            {/* One editable line (simple); extend to multiple if needed */}
            <Field label="Line description" error={errors.description}>
              <input
                className={inClass(errors.description)}
                value={form.lines?.[0]?.description ?? ''}
                onChange={(e) => {
                  const lines = [...(form.lines || [{ description: '', qty: 1, rate: 0 }])];
                  lines[0] = { ...(lines[0] || {}), description: e.target.value };
                  setForm({ ...form, lines });
                }}
              />
            </Field>

            <Field label="Qty" error={errors.qty}>
              <input
                type="number"
                className={inClass(errors.qty)}
                value={form.lines?.[0]?.qty ?? 1}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  const lines = [...(form.lines || [{ description: '', qty: 1, rate: 0 }])];
                  lines[0] = { ...(lines[0] || {}), qty: Number.isFinite(v) ? v : 1 };
                  setForm({ ...form, lines });
                }}
              />
            </Field>

            <Field label="Rate (₹)" error={errors.rate}>
              <input
                type="number"
                className={inClass(errors.rate)}
                value={form.lines?.[0]?.rate ?? 0}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  const lines = [...(form.lines || [{ description: '', qty: 1, rate: 0 }])];
                  lines[0] = { ...(lines[0] || {}), rate: Number.isFinite(v) ? v : 0 };
                  setForm({ ...form, lines });
                }}
              />
            </Field>

            <Field label="Tax (₹)">
              <input
                type="number"
                className={inClass()}
                value={form.tax ?? 0}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setForm({ ...form, tax: Number.isFinite(v) ? v : 0 });
                }}
              />
            </Field>

            <Field label="Status" error={errors.status}>
              <select
                className={inClass(errors.status)}
                value={(form.status ?? 'open').toLowerCase()}
                onChange={(e) => setForm({ ...form, status: e.target.value.toLowerCase() })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>

            {/* Display totals (read-only) */}
            <Field label="Subtotal (auto)">
              <input className={inClass()} value={inr(liveTotals.subtotal)} readOnly />
            </Field>
            <Field label="Total (auto)">
              <input className={inClass()} value={inr(liveTotals.total)} readOnly />
            </Field>
          </div>
        )}
      </SweetAlert>
    </Page>
  );
}

/* ---------- Small UI helpers ---------- */
function Field({ label, error, children }) {
  return (
    <label className="block">
      <div className="text-xs text-slate-600 mb-1">{label}</div>
      {children}
      {error && <div className="mt-1 text-[11px] text-rose-600">{error}</div>}
    </label>
  );
}
function inClass(err) {
  return [
    'w-full rounded-lg border px-3 py-2 text-sm outline-none',
    err ? 'border-rose-300 focus:ring-2 focus:ring-rose-300' : 'border-slate-300 focus:ring-2 focus:ring-emerald-400',
  ].join(' ');
}
