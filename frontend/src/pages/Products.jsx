// src/pages/Products.jsx
import React, { useEffect, useMemo, useState } from "react";
import Page from "../components/Page";
import { TableWrap, DataTable } from "../components/ui/Table";
import { Btn, BtnGhost, BtnDanger } from "../components/ui/Buttons";
import SweetAlert from "../components/ui/SweetAlert";
import { notify } from "../components/ui/Toast";
import { api } from "../lib/api";

const toNumber = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

// ---- API wrappers (use your api.js which adds tenant + token) ----
const listProducts  = async (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api(`/api/products${qs ? `?${qs}` : ""}`);
};
const createProduct = async (body) =>
  api("/api/products", { method: "POST", body });
const updateProduct = async (id, body) =>
  api(`/api/products/${encodeURIComponent(id)}`, { method: "PATCH", body });
const deleteProduct = async (id) =>
  api(`/api/products/${encodeURIComponent(id)}`, { method: "DELETE" });

// ---- mapping: ALWAYS expose a stable `id` key ----
const mapFromApi = (p) => ({
  id: String(p.id || p._id || ""),
  name: p.name || "",
  price: toNumber(p.price),
  sku: p.sku || "",
  hsn: p.hsn || "",
  unit: p.unit || "",
  stock: toNumber(p.stock),
  gstPct: toNumber(p.gstPct ?? p.taxPct),
  isActive: p.isActive !== false,
  _raw: p,
});

function validate(values) {
  const e = {};
  if (!String(values.name || "").trim()) e.name = "Name required";
  if (!(toNumber(values.price) > 0)) e.price = "Price must be > 0";
  if (values.gstPct < 0) e.gstPct = "GST must be ≥ 0";
  if (values.stock < 0) e.stock = "Stock must be ≥ 0";
  return e;
}

function inClass(err) {
  return [
    "w-full rounded-lg border px-3 py-2 text-sm outline-none",
    err ? "border-rose-300 focus:ring-2 focus:ring-rose-300"
        : "border-slate-300 focus:ring-2 focus:ring-emerald-400",
  ].join(" ");
}

function Field({ label, error, children }) {
  return (
    <label className="block">
      <div className="text-xs text-slate-600 mb-1">{label}</div>
      {children}
      {error && <div className="mt-1 text-[11px] text-rose-600">{error}</div>}
    </label>
  );
}

export default function Products() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [target, setTarget] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  // ---- initial load ----
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await listProducts({ limit: 500 });
        if (!alive) return;
        const mapped = (Array.isArray(data) ? data : []).map(mapFromApi);
        setRows(mapped);
      } catch (e) {
        console.error(e);
        notify.error("Failed to load products", e.message || "Try again");
      }
    })();
    return () => { alive = false; };
  }, []);

  // ---- search filter (client side; server has ?search too if you want) ----
  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const s = q.trim().toLowerCase();
    return rows.filter((r) =>
      (r.name || "").toLowerCase().includes(s) ||
      (r.sku || "").toLowerCase().includes(s) ||
      (r.hsn || "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  // ---- delete flow ----
  const openDelete = (row) => { setTarget(row); setConfirmOpen(true); };

  const confirmDelete = async () => {
    const id = target?.id || target?._id;
    setConfirmOpen(false);
    setTarget(null);
    if (!id) return;

    const prev = rows;
    setRows(rows.filter((r) => r.id !== id)); // optimistic

    try {
      await deleteProduct(id); // backend returns 204 (handled by api.js)
      notify.error("Product deleted", `Removed ${id}`);
    } catch (e) {
      console.error(e);
      setRows(prev); // rollback
      notify.error("Delete failed", e.message || "Try again");
    }
  };

  // ---- create/edit ----
  const openCreate = () => {
    setFormInitial({
      name: "",
      price: 0,
      sku: "",
      hsn: "",
      unit: "piece",
      stock: 0,
      gstPct: 0,
      isActive: true,
    });
    setFormErrors({});
    setFormOpen(true);
  };

  const openEdit = (row) => {
    setFormInitial({ ...row }); // row already normalized
    setFormErrors({});
    setFormOpen(true);
  };

  const submitForm = async () => {
    const v = {
      ...formInitial,
      price: toNumber(formInitial.price),
      stock: toNumber(formInitial.stock),
      gstPct: toNumber(formInitial.gstPct),
    };
    const errors = validate(v);
    setFormErrors(errors);
    if (Object.keys(errors).length) {
      notify.error("Please fix the highlighted fields");
      return;
    }

    const payload = {
      name: v.name,
      price: v.price,
      sku: v.sku || undefined,
      hsn: v.hsn || undefined,
      unit: v.unit || undefined,
      stock: v.stock,
      taxPct: v.gstPct,       // backend uses taxPct? we also store gstPct on model; either is fine
      gstPct: v.gstPct,
      isActive: v.isActive !== false,
    };

    const isEdit = !!v.id;
    const p = isEdit
      ? updateProduct(v.id, payload)
      : createProduct(payload);

    notify.promise(p, {
      pending: { title: isEdit ? "Saving…" : "Adding product…" },
      success: (res) => ({
        title: isEdit ? "Updated ✅" : "Created 🎉",
        message: (res.name || v.name),
      }),
      error: (err) => ({ title: "Failed ❌", message: err?.message || "" }),
    });

    try {
      const res = await p;
      const mapped = mapFromApi(res);
      const idx = rows.findIndex((r) => r.id === mapped.id);
      const next = [...rows];
      if (idx >= 0) next[idx] = mapped; else next.unshift(mapped);
      setRows(next);
      setFormOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Page
      title="Products"
      subtitle="Create, update and manage your catalog."
      actions={<Btn onClick={openCreate}>+ Add Product</Btn>}
    >
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
          placeholder="Search name / SKU / HSN"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* Table */}
      <TableWrap>
        <DataTable
          empty="No products"
          initialSort={{ key: "name", dir: "asc" }}
          columns={[
            { key: "name", header: "Name" },
            { key: "sku", header: "SKU" },
            { key: "hsn", header: "HSN" },
            {
              key: "price",
              header: "Price (₹)",
              align: "right",
              render: (r) => (toNumber(r.price)).toLocaleString("en-IN"),
            },
            { key: "unit", header: "Unit" },
            { key: "stock", header: "Stock", align: "right" },
            { key: "gstPct", header: "GST (%)", align: "right" },
            {
              key: "_actions",
              header: "Actions",
              align: "right",
              render: (r) => (
                <div className="flex justify-end gap-2">
                  <BtnGhost onClick={() => openEdit(r)}>Edit</BtnGhost>
                  <BtnDanger onClick={() => openDelete(r)}>Delete</BtnDanger>
                </div>
              ),
            },
          ]}
          rows={filtered}
        />
      </TableWrap>

      {/* Delete confirm */}
      <SweetAlert
        open={confirmOpen}
        title="Delete product?"
        message={target ? `This will permanently remove ${target.name || target.id}.` : ""}
        confirmText="Delete"
        cancelText="Cancel"
        tone="rose"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* Create/Edit dialog */}
      <SweetAlert
        open={formOpen}
        title={formInitial?.id ? "Edit product" : "New product"}
        message="Fill the required fields below."
        confirmText={formInitial?.id ? "Save" : "Create"}
        cancelText="Cancel"
        tone="emerald"
        onConfirm={submitForm}
        onCancel={() => setFormOpen(false)}
      >
        {formInitial && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" error={formErrors.name}>
              <input
                className={inClass(formErrors.name)}
                value={formInitial.name}
                onChange={(e) => setFormInitial({ ...formInitial, name: e.target.value })}
              />
            </Field>
            <Field label="Price (₹)" error={formErrors.price}>
              <input
                type="number"
                className={inClass(formErrors.price)}
                value={formInitial.price}
                onChange={(e) => setFormInitial({ ...formInitial, price: toNumber(e.target.value) })}
              />
            </Field>
            <Field label="SKU">
              <input
                className={inClass()}
                value={formInitial.sku || ""}
                onChange={(e) => setFormInitial({ ...formInitial, sku: e.target.value })}
              />
            </Field>
            <Field label="HSN">
              <input
                className={inClass()}
                value={formInitial.hsn || ""}
                onChange={(e) => setFormInitial({ ...formInitial, hsn: e.target.value })}
              />
            </Field>
            <Field label="Unit">
              <input
                className={inClass()}
                value={formInitial.unit || ""}
                onChange={(e) => setFormInitial({ ...formInitial, unit: e.target.value })}
              />
            </Field>
            <Field label="Stock" error={formErrors.stock}>
              <input
                type="number"
                className={inClass(formErrors.stock)}
                value={formInitial.stock}
                onChange={(e) => setFormInitial({ ...formInitial, stock: toNumber(e.target.value) })}
              />
            </Field>
            <Field label="GST (%)" error={formErrors.gstPct}>
              <input
                type="number"
                className={inClass(formErrors.gstPct)}
                value={formInitial.gstPct}
                onChange={(e) => setFormInitial({ ...formInitial, gstPct: toNumber(e.target.value) })}
              />
            </Field>
            <label className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                checked={!!formInitial.isActive}
                onChange={(e) => setFormInitial({ ...formInitial, isActive: e.target.checked })}
              />
              <span className="text-sm text-slate-700">Active</span>
            </label>
          </div>
        )}
      </SweetAlert>
    </Page>
  );
}
