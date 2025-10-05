import React from "react";
const map = {
  Paid: "bg-emerald-100 text-emerald-700",
  Overdue: "bg-rose-100 text-rose-700",
  Sent: "bg-amber-100 text-amber-700",
  Draft: "bg-slate-100 text-slate-700"
};
export default function Badge({ children }) {
  const cls = map[children] || "bg-slate-100 text-slate-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}
    >
      {children}
    </span>
  );
}
