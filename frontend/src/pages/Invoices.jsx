// src/pages/Invoices.jsx
import React, { useEffect, useMemo, useState } from "react";
import Page from "../components/Page";
import { TableWrap, DataTable } from "../components/ui/Table";
import { Btn, BtnGhost, BtnDanger } from "../components/ui/Buttons";
import SweetAlert from "../components/ui/SweetAlert";
import { notify } from "../components/ui/Toast";
import { inr, dd } from "../data/store";
import { api } from "../lib/api";
import ProductSelect from "../components/ProductSelect";

const STATUS = ["All", "Open", "Overdue", "Paid"];

/* ------------------------------ status mapping ------------------------------ */
// UI -> API
const toApiStatus = (ui) => {
  const s = String(ui || "").toLowerCase();
  if (s === "paid") return "paid";
  if (s === "open" || s === "overdue") return "sent"; // treat Overdue as an 'open/sent' state
  return null; // backend will default to draft if null on create
};
// API -> UI
const toUiStatus = (api) => {
  const s = String(api || "").toLowerCase();
  if (s === "paid") return "Paid";
  if (s === "sent" || s === "draft") return "Open"; // show drafts as Open in UI
  if (s === "void") return "Open";
  return "Open";
};

/* ------------------------------ API helpers ------------------------------ */
const listInvoices = async (status = "All") => {
  // map UI status to API query param
  const apiStatus = toApiStatus(status);
  const qs = apiStatus ? `?status=${encodeURIComponent(apiStatus)}` : "";
  return api(`/api/invoices${qs}`);
};

const createInvoice = async (body) =>
  api("/api/invoices", { method: "POST", body });
const updateInvoice = async (id, body) =>
  api(`/api/invoices/${encodeURIComponent(id)}`, { method: "PUT", body });
const deleteInvoice = async (id) =>
  api(`/api/invoices/${encodeURIComponent(id)}`, { method: "DELETE" });

const listCustomers = async () => api("/api/customers");

/* ------------------------------ utils ------------------------------ */
const computeTotal = (unitPrice, qty, gstPct) => {
  const up = Number(unitPrice) || 0;
  const q = Number(qty) || 0;
  const g = Number(gstPct) || 0;
  return Math.max(0, Math.round(up * q * (1 + g / 100)));
};

const genInvoiceNo = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const r = Math.floor(Math.random() * 10000);
  return `INV-${y}${m}-${String(r).padStart(4, "0")}`;
};

// Convert API invoice -> UI row
const mapFromApi = (inv) => ({
  id: inv.id || inv._id || inv.invoiceNo,
  number: inv.invoiceNo,
  customerName: inv.customerName || inv.customer?.name || "",
  total: Number(inv.total) || 0,
  date: inv.invoiceDate, // YYYY-MM-DD from backend
  dueDate: inv.dueDate || inv.invoiceDate, // if you add dueDate later, it will map here
  status: toUiStatus(inv.status),
  // keep any extras for edit
  _raw: inv,
});

// Convert UI form -> API payload
const buildApiPayload = (syncedForm, customers) => {
  const first = syncedForm.items?.[0] || {
    name: "",
    qty: 1,
    unitPrice: 0,
    gstPct: 0,
  };
  const qty = Number(first.qty) || 1;
  const rate = Number(first.unitPrice) || 0;
  const gstPct = Number(first.gstPct) || 0;

  const id = syncedForm.customerId || "";
  const validId = typeof id === "string" && id.length === 24;

  // tax in backend is an amount (not percentage)
  const subtotal = qty * rate;
  const tax = Math.round((subtotal * gstPct) / 100);

  const customer = customers.find(
    (x) => String(x._id) === String(syncedForm.customerId)
  );

  return {
    ...(validId
      ? { customerId: id }
      : { customerName: customer?.name || syncedForm.customerName || "" }),
    invoiceNo: syncedForm.number || "", // backend will auto-generate if blank
    invoiceDate: syncedForm.date || new Date(),
    status: toApiStatus(syncedForm.status) || undefined, // let backend default if undefined
    lines: [
      {
        description: first.name || "",
        qty,
        rate,
      },
    ],
    tax,
  };
};

/* ------------------------------ validation ------------------------------ */
const isObjectId = (s) => typeof s === "string" && /^[a-f\d]{24}$/i.test(s);

function validateInvoice(values) {
  const e = {};
  const hasId = isObjectId(values.customerId);
  const hasName = !!String(values.customerName || "").trim();

  if (!hasId && !hasName) e.customerId = "Select a customer";

  if (!values.items?.length) e.items = "At least one line item";
  const first = values.items?.[0] || {};
  if (!first.name) e.itemName = "Item name required";
  if (!first.unitPrice || Number(first.unitPrice) <= 0)
    e.unitPrice = "Price must be > 0";
  if (!values.date || Number.isNaN(Date.parse(values.date)))
    e.date = "Valid date required";
  if (!values.dueDate || Number.isNaN(Date.parse(values.dueDate)))
    e.dueDate = "Valid due date required";
  if (!values.status || !["Open", "Overdue", "Paid"].includes(values.status))
    e.status = "Choose status";
  return e;
}

/* ------------------------------ Page ------------------------------ */
export default function Invoices() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("All");
  const [q, setQ] = useState("");

  const [customers, setCustomers] = useState([]);

  // modals
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  /* ------------------------------ load ------------------------------ */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [ci, cust] = await Promise.all([
          listInvoices(status),
          listCustomers(),
        ]);
        if (alive) {
          const arr = Array.isArray(ci) ? ci : [];
          setRows(arr.map(mapFromApi));
          setCustomers(Array.isArray(cust) ? cust : []);
        }
      } catch (e) {
        console.error(e);
        notify.error("Failed to load invoices", e.message || "Try again");
      }
    })();
    return () => {
      alive = false;
    };
  }, [status]);

  // read status from hash (?status=Open)
  useEffect(() => {
    const readStatusFromHash = () => {
      const query = window.location.hash.split("?")[1] || "";
      const params = new URLSearchParams(query);
      const s = params.get("status");
      if (s && STATUS.includes(s)) setStatus(s);
    };
    readStatusFromHash();
    window.addEventListener("hashchange", readStatusFromHash);
    return () => window.removeEventListener("hashchange", readStatusFromHash);
  }, []);

  /* ------------------------------ filter ------------------------------ */
  const filtered = useMemo(() => {
    let list = rows;
    if (status !== "All") list = list.filter((r) => r.status === status);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r.number || "").toLowerCase().includes(s) ||
          (r.customerName || "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [rows, q, status]);

  /* ------------------------------ CRUD ------------------------------ */
  const openDelete = (row) => {
    setTarget(row);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    const id = target?.id || target?._id || target?.number;
    if (!id) return setConfirmOpen(false);
    const prev = rows;
    setRows(rows.filter((r) => (r.id || r._id || r.number) !== id));
    setConfirmOpen(false);
    setTarget(null);
    try {
      await deleteInvoice(id);
      notify.error("Invoice deleted", `Invoice ${id} removed`);
    } catch (e) {
      setRows(prev);
      notify.error("Delete failed", e.message || "Try again");
    }
  };

  const openCreate = () => {
    const today = new Date();
    const due = new Date(today);
    due.setDate(due.getDate() + 14);
    setFormInitial({
      number: genInvoiceNo(),
      customerId: "", // required
      customerName: "",
      date: today.toISOString().slice(0, 10),
      dueDate: due.toISOString().slice(0, 10),
      status: "Open",
      items: [
        {
          name: "",
          qty: 1,
          unitPrice: 0,
          gstPct: 18,
        },
      ],
      total: 0,
    });
    setFormErrors({});
    setFormOpen(true);
  };

  const openEdit = (row) => {
    const first = (row.items && row.items[0]) || {
      name: "",
      qty: 1,
      unitPrice: 0,
      gstPct: 0,
    };
    setFormInitial({
      ...row,
      items: [first],
      total:
        Number(row.total) ||
        computeTotal(first.unitPrice, first.qty, first.gstPct),
    });
    setFormErrors({});
    setFormOpen(true);
  };

  const submitForm = async () => {
    // keep items + total in sync
    const first = (formInitial.items && formInitial.items[0]) || {
      name: "",
      qty: 1,
      unitPrice: 0,
      gstPct: 0,
    };
    const synced = {
      ...formInitial,
      items: [
        {
          name: first.name,
          qty: Number(first.qty) || 1,
          unitPrice: Number(first.unitPrice) || 0,
          gstPct: Number(first.gstPct) || 0,
        },
      ],
      total: computeTotal(first.unitPrice, first.qty, first.gstPct),
    };
    setFormInitial(synced);

    // derive a reliable customerName if id is present
    const id = String(synced.customerId || "");
    const validId = /^[a-f\d]{24}$/i.test(id);
    const fromList = validId
      ? customers.find((x) => String(x._id) === id)?.name
      : null;
    const ensuredName = (synced.customerName || fromList || "").trim();

    // run validation (now accepts either id or name)
    const errors = validateInvoice({ ...synced, customerName: ensuredName });
    setFormErrors(errors);
    if (Object.keys(errors).length) {
      notify.error("Please fix the highlighted fields");
      return;
    }

    // build the backend payload (id if valid; else name)
    const qty = Number(synced.items[0].qty) || 1;
    const rate = Number(synced.items[0].unitPrice) || 0;
    const gstPct = Number(synced.items[0].gstPct) || 0;
    const subtotal = qty * rate;
    const tax = Math.round((subtotal * gstPct) / 100);

    const payload = {
      ...(validId ? { customerId: id } : { customerName: ensuredName }),
      invoiceNo: synced.number || "", // backend can auto-fill if empty
      invoiceDate: synced.date || new Date(),
      status: synced.status === "Paid" ? "paid" : "sent", // map UI→API; "Open/Overdue" → "sent"
      lines: [{ description: synced.items[0].name, qty, rate }],
      tax,
    };

    const isEdit = !!(synced?.id || synced?._id);
    const keyId = synced?.id || synced?._id || synced?.number;
    const p = isEdit ? updateInvoice(keyId, payload) : createInvoice(payload);

    notify.promise(p, {
      pending: {
        title: isEdit ? "Saving changes…" : "Creating invoice…",
        message: "Please wait",
      },
      success: (res) => ({
        title: isEdit ? "Invoice updated ✅" : "Invoice created 🎉",
        message: `Invoice ${res.invoiceNo || res.number || ""}`,
      }),
      error: (err) => ({
        title: "Failed ❌",
        message: err?.message || "Try again",
      }),
    });

    try {
      const res = await p;
      const mapped = {
        id: res.id || res._id || res.invoiceNo,
        number: res.invoiceNo,
        customerName: res.customerName || res.customer?.name || ensuredName,
        total: Number(res.total) || subtotal + tax,
        date: res.invoiceDate,
        dueDate: res.dueDate || res.invoiceDate,
        status: res.status === "paid" ? "Paid" : "Open",
        _raw: res,
      };
      const idx = rows.findIndex(
        (r) => (r.id || r._id || r.number) === mapped.id
      );
      const next = [...rows];
      if (idx >= 0) next[idx] = mapped;
      else next.unshift(mapped);
      setRows(next);
      setFormOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  /* ------------------------------ render ------------------------------ */
  return (
    <Page
      title="Invoices"
      subtitle="Search, filter, and manage your invoices."
      actions={<Btn onClick={openCreate}>+ Add Invoice</Btn>}
    >
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none
                     focus:ring-2 focus:ring-emerald-400"
          placeholder="Search number or customer"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="w-44 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none
                     focus:ring-2 focus:ring-emerald-400"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <TableWrap>
        <DataTable
          empty="No invoices"
          initialSort={{ key: "number", dir: "asc" }}
          columns={[
            { key: "number", header: "#" },
            { key: "customerName", header: "Customer" },
            {
              key: "total",
              header: "Total",
              align: "right",
              render: (r) => inr(Number(r.total) || 0),
            },
            { key: "date", header: "Date", render: (r) => dd(r.date) },
            { key: "dueDate", header: "Due", render: (r) => dd(r.dueDate) },
            {
              key: "status",
              header: "Status",
              render: (r) => (
                <span
                  className={
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs border " +
                    (r.status === "Paid"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : r.status === "Overdue"
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : "bg-sky-50 text-sky-700 border-sky-200")
                  }
                >
                  {r.status || "Open"}
                </span>
              ),
            },
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
        title="Delete invoice?"
        message={target ? `This will permanently remove ${target.number}.` : ""}
        confirmText="Delete"
        cancelText="Cancel"
        tone="rose"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* Create/Edit dialog */}
      <SweetAlert
        open={formOpen}
        title={
          formInitial?.id || formInitial?._id ? "Edit invoice" : "New invoice"
        }
        message="Fill the required fields below."
        confirmText={formInitial?.id || formInitial?._id ? "Save" : "Create"}
        cancelText="Cancel"
        tone="emerald"
        onConfirm={submitForm}
        onCancel={() => setFormOpen(false)}
      >
        {formInitial && (
          <div className="grid grid-cols-2 gap-3">
            {/* number (readonly) */}
            <Field label="Invoice #" error={formErrors.number}>
              <input
                className={inClass(formErrors.number)}
                value={formInitial.number || ""}
                readOnly
              />
            </Field>

            {/* customer */}
            <Field label="Customer" error={formErrors.customerId}>
              <select
                className={inClass(formErrors.customerId)}
                value={formInitial.customerId || ""}
                onChange={(e) => {
                  const id = e.target.value;
                  const c = customers.find((x) => String(x._id) === id);
                  setFormInitial({
                    ...formInitial,
                    customerId: id,
                    customerName: c?.name || "",
                  });
                }}
              >
                <option key="none" value="">
                  — Select —
                </option>
                {customers.map((c, idx) => (
                  <option key={c._id || idx} value={c._id || c.id || ""}>
                    {c.name || `Customer ${idx + 1}`}
                  </option>
                ))}
              </select>
            </Field>

            {/* Product picker that can fill first line */}
            <Field label="Pick a product (optional)">
              <ProductSelect
                onPick={(p) => {
                  const qty = Number(formInitial.items?.[0]?.qty || 1) || 1;
                  const unitPrice = Number(p.price ?? p.unitPrice ?? 0);
                  const gstPct = Number(p.gstPct ?? 0);
                  const items = [{ name: p.name, qty, unitPrice, gstPct }];
                  setFormInitial({
                    ...formInitial,
                    items,
                    total: computeTotal(unitPrice, qty, gstPct),
                  });
                }}
              />
            </Field>

            {/* item name */}
            <Field label="Item name" error={formErrors.itemName}>
              <input
                className={inClass(formErrors.itemName)}
                value={formInitial.items?.[0]?.name || ""}
                onChange={(e) => {
                  const items = [
                    ...(formInitial.items || [
                      { qty: 1, unitPrice: 0, gstPct: 0 },
                    ]),
                  ];
                  items[0] = { ...(items[0] || {}), name: e.target.value };
                  setFormInitial({ ...formInitial, items });
                }}
              />
            </Field>

            {/* unit price */}
            <Field label="Unit price (₹)" error={formErrors.unitPrice}>
              <input
                type="number"
                className={inClass(formErrors.unitPrice)}
                value={formInitial.items?.[0]?.unitPrice ?? ""}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  const qty = Number(formInitial.items?.[0]?.qty || 1);
                  const gst = Number(formInitial.items?.[0]?.gstPct || 0);
                  const items = [
                    ...(formInitial.items || [
                      { qty: 1, unitPrice: 0, gstPct: 0 },
                    ]),
                  ];
                  items[0] = { ...(items[0] || {}), unitPrice: v };
                  setFormInitial({
                    ...formInitial,
                    items,
                    total: computeTotal(v, qty, gst),
                  });
                }}
              />
            </Field>

            {/* quantity */}
            <Field label="Quantity">
              <input
                type="number"
                className={inClass()}
                value={formInitial.items?.[0]?.qty ?? 1}
                onChange={(e) => {
                  const qty = Number(e.target.value);
                  const up = Number(formInitial.items?.[0]?.unitPrice || 0);
                  const gst = Number(formInitial.items?.[0]?.gstPct || 0);
                  const items = [
                    ...(formInitial.items || [
                      { qty: 1, unitPrice: 0, gstPct: 0 },
                    ]),
                  ];
                  items[0] = { ...(items[0] || {}), qty };
                  setFormInitial({
                    ...formInitial,
                    items,
                    total: computeTotal(up, qty, gst),
                  });
                }}
              />
            </Field>

            {/* GST */}
            <Field label="GST (%)">
              <input
                type="number"
                className={inClass()}
                value={formInitial.items?.[0]?.gstPct ?? 0}
                onChange={(e) => {
                  const gst = Number(e.target.value);
                  const up = Number(formInitial.items?.[0]?.unitPrice || 0);
                  const qty = Number(formInitial.items?.[0]?.qty || 1);
                  const items = [
                    ...(formInitial.items || [
                      { qty: 1, unitPrice: 0, gstPct: 0 },
                    ]),
                  ];
                  items[0] = { ...(items[0] || {}), gstPct: gst };
                  setFormInitial({
                    ...formInitial,
                    items,
                    total: computeTotal(up, qty, gst),
                  });
                }}
              />
            </Field>

            {/* auto total */}
            <Field label="Total (auto)">
              <input
                className={inClass()}
                value={inr(Number(formInitial.total) || 0)}
                readOnly
                disabled
              />
            </Field>

            {/* status */}
            <Field label="Status" error={formErrors.status}>
              <select
                className={inClass(formErrors.status)}
                value={formInitial.status || "Open"}
                onChange={(e) =>
                  setFormInitial({ ...formInitial, status: e.target.value })
                }
              >
                <option>Open</option>
                <option>Overdue</option>
                <option>Paid</option>
              </select>
            </Field>

            {/* dates */}
            <Field label="Issue date" error={formErrors.date}>
              <input
                type="date"
                className={inClass(formErrors.date)}
                value={formInitial.date || ""}
                onChange={(e) =>
                  setFormInitial({ ...formInitial, date: e.target.value })
                }
              />
            </Field>

            <Field label="Due date" error={formErrors.dueDate}>
              <input
                type="date"
                className={inClass(formErrors.dueDate)}
                value={formInitial.dueDate || ""}
                onChange={(e) =>
                  setFormInitial({ ...formInitial, dueDate: e.target.value })
                }
              />
            </Field>
          </div>
        )}
      </SweetAlert>
    </Page>
  );
}

/* helpers */
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
    "w-full rounded-lg border px-3 py-2 text-sm outline-none",
    err
      ? "border-rose-300 focus:ring-2 focus:ring-rose-300"
      : "border-slate-300 focus:ring-2 focus:ring-emerald-400",
  ].join(" ");
}
