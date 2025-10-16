// src/components/Layout.jsx
import React, { useEffect, useState } from "react";
import Header from "./ui/Header";

/* ----------------------- tiny inline icon set (SVG) ----------------------- */
const Ic = ({ name, className = "w-4 h-4" }) => {
  const P = (d) => (
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
  const m = {
    gear: (
      <>
        {P("M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z")}
        {P(
          "M19 12l1.7-.7-.6-1.6-1.9.1a6.9 6.9 0 0 0-1-1.7l.9-1.7-1.4-1.1-1.5 1.2a7 7 0 0 0-1.9-.8L11 2H9.9l-.3 2.1a7 7 0 0 0-1.9.8L6.2 3.7 4.8 4.8l.9 1.7a6.9 6.9 0 0 0-1 1.7L2.8 8.7l-.6 1.6L4 12l-1.8.7.6 1.6 1.9-.1a6.9 6.9 0 0 0 1 1.7l-.9 1.7 1.4 1.1 1.5-1.2a7 7 0 0 0 1.9.8L13 22h1.1l.3-2.1a7 7 0 0 0 1.9-.8l1.5 1.2 1.4-1.1-.9-1.7c.4-.53.74-1.1 1-1.7l1.9.1.6-1.6L19 12z"
        )}
      </>
    ),
    chevron: <>{P("M8 10l4 4 4-4")}</>,
    chevronUp: <>{P("M16 14l-4-4-4 4")}</>,
    invoices: (
      <>
        {P("M8 6h8")} {P("M8 10h8")} {P("M8 14h5")}{" "}
        {P("M6 4h12v16l-3-2-3 2-3-2-3 2z")}
      </>
    ),
    payments: (
      <>
        {P("M4 8h16v8H4z")} {P("M6 12h4")} {P("M12 12h2")}{" "}
        {P("M4 8l2-3h12l2 3")}
      </>
    ),
    customers: (
      <>
        {P("M12 12a3 3 0 1 0-0.001-6A3 3 0 0 0 12 12z")}{" "}
        {P("M5 20a7 7 0 0 1 14 0")}
      </>
    ),
    products: (
      <>
        {P("M4 8l8-4 8 4-8 4-8-4z")} {P("M4 8v8l8 4 8-4V8")}
      </>
    ),
    vendors: (
      <>
        {P("M4 9h16v10H4z")} {P("M8 9V5h8v4")}
      </>
    ),
    bills: (
      <>
        {P("M7 6h10")} {P("M7 10h10")} {P("M7 14h7")} {P("M6 4h12v16H6z")}
      </>
    ),
    dashboard: (
      <>
        {P("M4 10h8V4H4z")} {P("M12 20h8v-6h-8z")} {P("M4 20h8v-6H4z")}{" "}
        {P("M16 10h4V4h-4z")}
      </>
    ),
    reports: (
      <>
        {P("M6 20h12")} {P("M8 16l3-3 3 3 3-4")} {P("M6 4h12v14H6z")}
      </>
    ),
    ai: (
      <>
        {P("M12 4v4")} {P("M12 16v4")} {P("M4 12h4")} {P("M16 12h4")}{" "}
        {P("M10 10h4v4h-4z")}
      </>
    ),
    user: (
      <>
        {P("M12 12a3 3 0 1 0-0.001-6A3 3 0 0 0 12 12z")}{" "}
        {P("M5 20a7 7 0 0 1 14 0")}
      </>
    ),
    power: (
      <>
        {P("M12 3v8")} {P("M6.5 6a8 8 0 1 0 11 0")}
      </>
    )
  };
  return (
    <svg viewBox="0 0 24 24" className={className}>
      {m[name] || null}
    </svg>
  );
};

/* --------------------------- sidebar atoms --------------------------- */
// Upgraded: if onClick is provided, it renders as a button (for Logout).
const Leaf = ({ href, label, icon, current, badge, onClick }) => {
  const base =
    "relative group flex items-center gap-2 rounded-md px-3 py-2 text-[14px] font-medium transition-colors duration-150";
  const state = current
    ? "bg-sky-50 text-sky-700"
    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900";
  const iconCls = current
    ? "text-sky-600"
    : "text-slate-500 group-hover:text-slate-700";

  const Inner = (
    <>
      <span
        className={`absolute left-0 top-0 bottom-0 translate-x-[-10px] rounded ${
          current
            ? "w-1.5 bg-green-500"
            : "w-px bg-slate-200 group-hover:bg-slate-300"
        }`}
      />
      {icon && (
        <Ic
          name={icon}
          className={`w-4.5 h-4.5 transition-colors ${iconCls}`}
        />
      )}
      <span className="truncate">{label}</span>
      {badge != null && (
        <span className="ml-auto text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
          {badge}
        </span>
      )}
    </>
  );

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${state} w-full text-left`}
    >
      {Inner}
    </button>
  ) : (
    <a href={href} className={`${base} ${state}`}>
      {Inner}
    </a>
  );
};

const SubGroup = ({ id, title, children, openMap, setOpenMap }) => {
  const open = openMap[id] ?? true;
  const toggle = () => setOpenMap((s) => ({ ...s, [id]: !open }));
  return (
    <div className="ml-3">
      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-200" />
        <button
          onClick={toggle}
          className="relative w-full flex items-center justify-between px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:text-slate-800"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-400" />
            <span>{title}</span>
          </span>
          <Ic
            name={open ? "chevronUp" : "chevron"}
            className="w-3.5 h-3.5 text-slate-500"
          />
        </button>
        <div className={`pl-6 mt-1 space-y-1 ${open ? "" : "hidden"}`}>
          {children}
        </div>
      </div>
    </div>
  );
};

const Group = ({ id, title, icon, children, openMap, setOpenMap }) => {
  const open = openMap[id] ?? true;
  const toggle = () => setOpenMap((s) => ({ ...s, [id]: !open }));
  useEffect(() => {
    localStorage.setItem("sb_dropdowns", JSON.stringify(openMap));
  }, [openMap]);
  return (
    <div className="px-2">
      <button
        onClick={toggle}
        className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-[12px] font-semibold ${
          open
            ? "bg-sky-50 text-sky-800"
            : "bg-slate-50 text-slate-700 hover:bg-slate-100"
        }`}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <Ic
            name={icon || "gear"}
            className={`${
              open ? "text-sky-600" : "text-slate-500"
            } w-4.5 h-4.5`}
          />
          <span className="uppercase tracking-wide">{title}</span>
        </span>
        <Ic
          name={open ? "chevronUp" : "chevron"}
          className={`${open ? "text-sky-600" : "text-slate-500"} w-4 h-4`}
        />
      </button>
      <div className={`mt-1 pl-4 relative ${open ? "" : "hidden"}`}>
        <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-200" />
        <div className="space-y-1">{children}</div>
      </div>
    </div>
  );
};

/* ------------------------------ hash helper ------------------------------ */
function useHash() {
  const [hash, setHash] = useState(
    typeof window !== "undefined" ? window.location.hash || "#/" : "#/"
  );
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return hash;
}

/* ------------------------------- layout root ------------------------------ */
export default function Layout({ children }) {
  const hash = useHash();
  const is = (p) => hash.startsWith(p);

  const [openMap, setOpenMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("sb_dropdowns")) || {};
    } catch {
      return {};
    }
  });

  // fixed sizes that match Header (h-16 md:h-20)
  const TOP_SM = 64; // 16 * 4
  const TOP_MD = 80; // 20 * 4
  const SB_W = 264;

  // compute top offset for current viewport
  const [top, setTop] = useState(() =>
    window.innerWidth >= 768 ? TOP_MD : TOP_SM
  );
  useEffect(() => {
    const onR = () => setTop(window.innerWidth >= 768 ? TOP_MD : TOP_SM);
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);

  // Logout handler
  const doLogout = () => {
    try {
      localStorage.removeItem("auth");
    } catch {}
    window.location.hash = "#/login";
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <Header />

      {/* Sidebar fixed BELOW the header */}
      <aside
        className="fixed z-30 left-0 bg-white border-r border-slate-200 overflow-y-auto shadow-sm"
        style={{
          top: `${top}px`,
          height: `calc(100vh - ${top}px)`,
          width: `${SB_W}px`
        }}
        aria-label="Sidebar"
      >
        <div className="px-2 pt-4 pb-8">
          {/* — PRIMARY — */}
          <div className="px-2">
            <div className="text-[13px] font-semibold uppercase tracking-wide text-blue-500 mt-2 mb-2">
              Primary
            </div>
            <div className="relative pl-4">
              <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-200" />
              <Leaf
                href="#/"
                label="Dashboard"
                icon="dashboard"
                current={hash === "#/" || hash === "#"}
              />
              <Leaf
                href="#/products"
                label="Products"
                icon="products"
                current={is("#/products")}
              />
              <Leaf
                href="#/customers"
                label="Customers"
                icon="customers"
                current={is("#/customers")}
              />
              <Leaf
                href="#/invoices"
                label="Invoices"
                icon="invoices"
                current={is("#/invoices")}
              />
              <Leaf
                href="#/payments"
                label="Payments"
                icon="payments"
                current={is("#/payments")}
              />
            </div>
          </div>

          {/* — OPERATIONS — */}
          <div className="px-2">
            <div className="text-[13px] font-semibold uppercase tracking-wide text-yellow-600 mt-5 mb-2">
              Operations
            </div>
            <div className="relative pl-4">
              <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-200" />
              <Leaf
                href="#/vendors"
                label="Vendors"
                icon="vendors"
                current={is("#/vendors")}
              />
              <Leaf
                href="#/bills"
                label="Bills"
                icon="bills"
                current={is("#/bills")}
              />
            </div>
          </div>

          {/* — ANALYTICS & AI — */}
          <div className="px-2">
            <div className="text-[13px] font-semibold uppercase tracking-wide text-green-600 mt-5 mb-2">
              Analytics & AI
            </div>
            <div className="relative pl-4">
              <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-200" />
              <Leaf
                href="#/reports"
                label="Reports"
                icon="reports"
                current={is("#/reports")}
              />
              {/* <Leaf
                href="#/ml/categorize"
                label="Categorize Items"
                icon="ai"
                current={is("#/ml/categorize")}
              /> */}
              <Leaf
                href="#/ml/latepay"
                label="Late Pay Risk"
                icon="ai"
                current={is("#/ml/latepay")}
              />
              <Leaf
                href="#/ml/forecast"
                label="Cash-In Forecast"
                icon="ai"
                current={is("#/ml/forecast")}
              />
            </div>
          </div>

          {/* — ACCOUNT — (replaces Settings) */}
          <div className="px-2">
            <div className="text-[13px] font-semibold uppercase tracking-wide text-red-600 mt-5 mb-2">
              Account
            </div>
            <div className="relative pl-4">
              <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-200 text-red-500" />
              <Leaf
                href="#/profile"
                label="Profile"
                icon="user"
                current={is("#/profile")}
              />
              <Leaf label="Logout" icon="power" className="text-red-500" onClick={doLogout} />
            </div>
          </div>
        </div>
      </aside>

      {/* Content area offset by header + sidebar */}
      <main
        className="min-h-screen"
        style={{ paddingTop: `${top}px`, paddingLeft: `${SB_W}px` }}
      >
        {children}
      </main>
    </div>
  );
}
