import React, { useEffect } from "react";
export default function Modal({ open, onClose, title, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="border-b px-4 py-3 text-lg font-semibold">{title}</div>
        <div className="p-4">{children}</div>
        {footer && (
          <div className="border-t p-3 flex justify-end gap-2">{footer}</div>
        )}
      </div>
    </div>
  );
}
