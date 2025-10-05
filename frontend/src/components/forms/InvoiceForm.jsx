import React, { useMemo, useState } from "react";
import Input from "../ui/Input";
import Select from "../ui/Select";
import Button, { Secondary } from "../ui/Button";
import { inr } from "../../lib/format";

const statusOpts = [
  { value: "Draft", label: "Draft" },
  { value: "Sent", label: "Sent" },
  { value: "Paid", label: "Paid" },
  { value: "Overdue", label: "Overdue" }
];
export default function InvoiceForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState(
    () =>
      initial || {
        number: "",
        customerName: "",
        dueDate: "",
        status: "Sent",
        items: [{ description: "", quantity: 1, unitPrice: 0, taxRate: 0 }]
      }
  );
  const subtotal = useMemo(
    () =>
      form.items.reduce(
        (s, i) => s + Number(i.quantity || 0) * Number(i.unitPrice || 0),
        0
      ),
    [form.items]
  );
  const taxTotal = useMemo(
    () =>
      form.items.reduce(
        (s, i) =>
          s +
          (Number(i.taxRate || 0) / 100) *
            (Number(i.quantity || 0) * Number(i.unitPrice || 0)),
        0
      ),
    [form.items]
  );
  const total = useMemo(() => subtotal + taxTotal, [subtotal, taxTotal]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setItem = (idx, k, v) =>
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === idx ? { ...it, [k]: v } : it))
    }));

  const addItem = () =>
    setForm((f) => ({
      ...f,
      items: [
        ...f.items,
        { description: "", quantity: 1, unitPrice: 0, taxRate: 0 }
      ]
    }));
  const rmItem = (idx) =>
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.({ ...form, subtotal, taxTotal, total });
      }}
      className="space-y-4"
    >
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Invoice #</label>
          <Input
            value={form.number}
            onChange={(e) => set("number", e.target.value)}
            placeholder="INV-1001"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Customer</label>
          <Input
            value={form.customerName}
            onChange={(e) => set("customerName", e.target.value)}
            placeholder="Acme Pvt Ltd"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Due Date</label>
          <Input
            type="date"
            value={form.dueDate}
            onChange={(e) => set("dueDate", e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Status</label>
          <Select
            value={form.status}
            onChange={(e) => set("status", e.target.value)}
            options={statusOpts}
          />
        </div>
      </div>

      <div className="rounded-2xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-2 text-left">Description</th>
              <th className="p-2 text-left w-24">Qty</th>
              <th className="p-2 text-left w-36">Unit</th>
              <th className="p-2 text-left w-28">Tax %</th>
              <th className="p-2 text-left w-36">Amount</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {form.items.map((it, idx) => {
              const amt = Number(it.quantity || 0) * Number(it.unitPrice || 0);
              return (
                <tr key={idx} className="border-t">
                  <td className="p-2">
                    <Input
                      value={it.description}
                      onChange={(e) =>
                        setItem(idx, "description", e.target.value)
                      }
                      placeholder="Item description"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      value={it.quantity}
                      onChange={(e) => setItem(idx, "quantity", e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      value={it.unitPrice}
                      onChange={(e) =>
                        setItem(idx, "unitPrice", e.target.value)
                      }
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      value={it.taxRate}
                      onChange={(e) => setItem(idx, "taxRate", e.target.value)}
                    />
                  </td>
                  <td className="p-2 align-middle">{inr(amt)}</td>
                  <td className="p-2 text-right">
                    <button
                      type="button"
                      className="text-rose-600 text-sm"
                      onClick={() => rmItem(idx)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="p-2">
          <button
            type="button"
            className="text-slate-700 text-sm"
            onClick={addItem}
          >
            + Add line
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1 items-end">
        <div className="text-sm">
          Subtotal: <b>{inr(subtotal)}</b>
        </div>
        <div className="text-sm">
          Tax: <b>{inr(taxTotal)}</b>
        </div>
        <div className="text-base">
          Total: <b>{inr(total)}</b>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Secondary type="button" onClick={onCancel}>
          Cancel
        </Secondary>
        <Button type="submit">Save Invoice</Button>
      </div>
    </form>
  );
}
