import React from "react";
export default function Button({ as = "button", className = "", ...props }) {
  const Cmp = as;
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition border shadow-sm";
  const look =
    "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 active:bg-indigo-800";
  return <Cmp className={`${base} ${look} ${className}`} {...props} />;
}
export function Secondary({ className = "", ...props }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition border shadow-sm";
  const look =
    "bg-white text-slate-900 border-slate-300 hover:bg-slate-50 active:bg-slate-100";
  return <button className={`${base} ${look} ${className}`} {...props} />;
}
export function Ghost({ className = "", ...props }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium";
  const look = "text-slate-700 hover:bg-slate-100";
  return <button className={`${base} ${look} ${className}`} {...props} />;
}
