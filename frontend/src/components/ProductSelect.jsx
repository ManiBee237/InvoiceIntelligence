// src/components/ProductSelect.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";

export default function ProductSelect({ onPick, className = "", placeholder = "Search product…" }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const res = await api(`/api/products?q=${encodeURIComponent(q)}`);
        if (alive) setItems(Array.isArray(res) ? res.slice(0, 10) : []);
      } catch {}
    }, 150);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!box.current) return;
      if (!box.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const choose = (it) => {
    setOpen(false);
    onPick?.({
      productId: it._id,
      name: it.name,
      unitPrice: Number(it.price || 0),
      gstPct: Number(it.gstPct || 0),
    });
  };

  return (
    <div className={`relative ${className}`} ref={box}>
      <input
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
        placeholder={placeholder}
        value={q}
        onChange={(e)=>{ setQ(e.target.value); setOpen(true); }}
        onFocus={()=>setOpen(true)}
      />
      {open && items.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow">
          {items.map(it => (
            <button key={it.id || it._id}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={()=>choose(it)}>
              <span className="truncate">{it.name}</span>
              <span className="ml-3 text-slate-500 text-xs">₹{Number(it.price||0).toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
