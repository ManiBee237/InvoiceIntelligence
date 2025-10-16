// src/pages/Login.jsx
import React, { useState } from "react";
import Card, { CardHeader, CardBody } from "../components/ui/Card";
import { notify } from "../components/ui/Toast";
import { api } from "../lib/api";
import { AnimatePresence, motion } from "framer-motion";

export default function Login() {
  const [mode, setMode] = useState("signin"); // 'signin' | 'signup'

  // shared
  const [tenant, setTenant] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);

  // signup-only
  const [tenantName, setTenantName] = useState("");
  const [name, setName] = useState("");
  const [pass2, setPass2] = useState("");

  const inClass = (err) =>
    [
      "w-full rounded-xl border bg-white/90 px-10 py-3 text-sm outline-none backdrop-blur",
      err
        ? "border-rose-300 focus:ring-2 focus:ring-rose-300"
        : "border-slate-200 focus:ring-2 focus:ring-emerald-400"
    ].join(" ");

  // validation
  const emailErr =
    email && !/^\S+@\S+\.\S+$/.test(email) ? "Enter a valid email" : "";
  const passErr = pass && pass.length < 4 ? "Min 4 characters" : "";
  const slugErr =
    tenant && !/^[a-z0-9-]{3,}$/i.test(tenant)
      ? "3+ chars, letters/numbers/-"
      : "";
  const pass2Err =
    mode === "signup" && pass2 && pass2 !== pass ? "Passwords must match" : "";

  // tiny strength meter
  const passStrength = (() => {
    let s = 0;
    if (pass.length >= 6) s++;
    if (/[A-Z]/.test(pass)) s++;
    if (/[0-9]/.test(pass) || /[^A-Za-z0-9]/.test(pass)) s++;
    return Math.min(s, 3);
  })();

  const setAuthStorage = (payload, ctx) => {
    const { tenantId, tenantSlug, token, user } = payload || {};
    try {
      localStorage.setItem("tenant", tenantSlug || ctx.tenant);
      if (tenantId) localStorage.setItem("tenantId", tenantId);
      if (user?.name) localStorage.setItem("userName", user.name);
      if (user?.email) localStorage.setItem("userEmail", user.email);
      // If backend didn’t send a user object (e.g., demo), fall back:
      if (!user?.name)
        localStorage.setItem("userName", (ctx.email || "").split("@")[0]);
      if (!user?.email) localStorage.setItem("userEmail", ctx.email || "");
      if (user?._id) localStorage.setItem("user", user._id);
      if (token) localStorage.setItem("token", token);
      localStorage.setItem(
        "auth",
        JSON.stringify({ email: ctx.email, t: Date.now(), remember })
      );
    } catch {}
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!tenant) return notify.error("Tenant required");
    if (slugErr) return notify.error("Invalid tenant");
    if (!email) return notify.error("Email required");
    if (emailErr) return notify.error("Invalid email");
    if (!pass) return notify.error("Password required");
    if (passErr) return notify.error("Weak password");
    if (mode === "signup") {
      if (!tenantName) return notify.error("Business / tenant name required");
      if (!name) return notify.error("Your name is required");
      if (pass2Err) return notify.error("Passwords must match");
    }

    setLoading(true);
    try {
      let res;
      if (mode === "signup") {
        res = await api("/api/auth/register", {
          method: "POST",
          body: {
            tenant: tenant.trim(),
            tenantName: tenantName.trim(),
            email: email.trim(),
            password: pass,
            name: name.trim()
          }
        });
        notify.success("Account created", "You are now signed in");
      } else {
        res = await api("/api/auth/login", {
          method: "POST",
          body: { tenant: tenant.trim(), email: email.trim(), password: pass }
        });
        notify.success("Welcome back", email);
      }
      setAuthStorage(res, { tenant, email });
      window.location.hash = "#/";
    } catch (err) {
      notify.error(err?.message || "Request failed");
    } finally {
      setLoading(false);
    }
  };

  // animation
  const slideFade = {
    initial: { opacity: 0, y: 10, filter: "blur(2px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    exit: { opacity: 0, y: -10, filter: "blur(2px)" },
    transition: { duration: 0.28, ease: "easeOut" }
  };

  return (
    <div className="relative min-h-screen grid lg:grid-cols-2 bg-slate-50 overflow-hidden">
      <BGTexture />

      {/* Left brand pane */}
      <div className="relative hidden lg:flex items-center justify-center">
        <HeroImage />
        <div className="relative z-10 flex flex-col items-center gap-5 px-8">
          <LogoMark />
          <div className="text-center">
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
              LedgerFlow
            </h1>
            <p className="mt-1 text-slate-600">
              Invoices, payables & cash intelligence — all in one place.
            </p>
          </div>
          <ul className="mt-6 space-y-2 text-sm text-slate-600">
            <li className="flex items-center gap-2">
              <Dot ok /> GST-ready invoices & bills
            </li>
            <li className="flex items-center gap-2">
              <Dot ok /> Late-pay risk scoring
            </li>
            <li className="flex items-center gap-2">
              <Dot ok /> Cash-in forecasting
            </li>
            <li className="flex items-center gap-2">
              <Dot ok /> Clean, fast UI
            </li>
          </ul>
        </div>
      </div>

      {/* Right pane */}
      <div className="relative flex items-center justify-center px-6 py-10">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-sky-500 to-indigo-500" />
        <DottedOverlay intensity={0.18} />
        <div className="w-full max-w-[520px]">
          <div className="rounded-2xl p-[1px] bg-gradient-to-br from-slate-200 via-white to-slate-200 shadow-[0_16px_50px_rgba(2,6,23,.12)]">
            <div className="rounded-2xl bg-white/90 backdrop-blur">
              <Card>
                <CardHeader
                  title={
                    <div className="flex items-center gap-2">
                      <MiniLogo />
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={mode}
                          {...slideFade}
                          className="inline-block"
                        >
                          {mode === "signin"
                            ? "Sign in"
                            : "Create your account"}
                        </motion.span>
                      </AnimatePresence>
                    </div>
                  }
                  subtitle={
                    mode === "signin"
                      ? "Welcome back — let’s get you to the dashboard"
                      : "Spin up a tenant and your first user"
                  }
                />

                {/* Segmented control */}
                <div className="px-6 pt-2">
                  <div className="relative inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm">
                    <button
                      type="button"
                      onClick={() => setMode("signin")}
                      className={`relative px-3 py-1.5 rounded-lg transition-colors ${
                        mode === "signin"
                          ? "text-white"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {mode === "signin" && (
                        <motion.span
                          layoutId="tab-pill"
                          className="absolute inset-0 rounded-lg bg-emerald-600 shadow-[0_6px_16px_rgba(16,185,129,.35)]"
                        />
                      )}
                      <span className="relative z-10">Sign in</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setMode("signup")}
                      className={`relative px-3 py-1.5 rounded-lg transition-colors ${
                        mode === "signup"
                          ? "text-white"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {mode === "signup" && (
                        <motion.span
                          layoutId="tab-pill"
                          className="absolute inset-0 rounded-lg bg-emerald-600 shadow-[0_6px_16px_rgba(16,185,129,.35)]"
                        />
                      )}
                      <span className="relative z-10">Create account</span>
                    </button>
                  </div>
                </div>

                <CardBody>
                  <form onSubmit={submit} className="space-y-6">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={mode}
                        {...slideFade}
                        className="space-y-4"
                      >
                        {/* Tenant slug */}
                        <div className="space-y-1">
                          <label className="text-xs text-slate-600">
                            Tenant
                          </label>
                          <div className="relative">
                            <IconTenant />
                            <input
                              className={inClass(slugErr)}
                              placeholder="tenant Name"
                              value={tenant}
                              onChange={(e) => setTenant(e.target.value)}
                            />
                          </div>
                          <p className="text-[11px] text-slate-500">
                            Used to scope your data (sent as{" "}
                            <code className="font-mono">x-tenant-id</code>).
                          </p>
                          {slugErr && (
                            <p className="text-[11px] text-rose-600">
                              {slugErr}
                            </p>
                          )}
                        </div>

                        {mode === "signup" && (
                          <>
                            <div className="space-y-1">
                              <label className="text-xs text-slate-600">
                                Business / Tenant name
                              </label>
                              <div className="relative">
                                <IconBuilding />
                                <input
                                  className={inClass(!tenantName && "err")}
                                  placeholder="Your company name"
                                  value={tenantName}
                                  onChange={(e) =>
                                    setTenantName(e.target.value)
                                  }
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-xs text-slate-600">
                                Your name
                              </label>
                              <div className="relative">
                                <IconUser />
                                <input
                                  className={inClass(!name && "err")}
                                  placeholder="Full name"
                                  value={name}
                                  onChange={(e) => setName(e.target.value)}
                                />
                              </div>
                            </div>
                          </>
                        )}

                        <div className="space-y-1">
                          <label className="text-xs text-slate-600">
                            Email
                          </label>
                          <div className="relative">
                            <IconEmail />
                            <input
                              type="email"
                              className={inClass(emailErr)}
                              placeholder="your@company.com"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                            />
                          </div>
                          {emailErr && (
                            <p className="text-[11px] text-rose-600">
                              {emailErr}
                            </p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs text-slate-600">
                            Password
                          </label>
                          <div className="relative">
                            <IconLock />
                            <input
                              className={inClass(passErr || pass2Err)}
                              placeholder="Enter password"
                              type={show ? "text" : "password"}
                              value={pass}
                              onChange={(e) => setPass(e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => setShow((s) => !s)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 text-xs"
                              aria-label={
                                show ? "Hide password" : "Show password"
                              }
                            >
                              {show ? "Hide" : "Show"}
                            </button>
                          </div>

                          {/* strength meter */}
                          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className={[
                                "h-full transition-all",
                                passStrength === 0
                                  ? "w-0"
                                  : passStrength === 1
                                  ? "w-1/3 bg-rose-400"
                                  : passStrength === 2
                                  ? "w-2/3 bg-amber-400"
                                  : "w-full bg-emerald-500"
                              ].join(" ")}
                            />
                          </div>

                          {(passErr || pass2Err) && (
                            <p className="text-[11px] text-rose-600">
                              {passErr || pass2Err}
                            </p>
                          )}
                        </div>

                        {mode === "signup" && (
                          <div className="space-y-1">
                            <label className="text-xs text-slate-600">
                              Confirm password
                            </label>
                            <div className="relative">
                              <IconLock />
                              <input
                                className={inClass(pass2Err)}
                                placeholder="Re-enter password"
                                type={show ? "text" : "password"}
                                value={pass2}
                                onChange={(e) => setPass2(e.target.value)}
                              />
                            </div>
                            {pass2Err && (
                              <p className="text-[11px] text-rose-600">
                                {pass2Err}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="flex items-center justify-between text-sm pt-2">
                          <label className="inline-flex items-center gap-2 text-slate-700">
                            <input
                              type="checkbox"
                              checked={remember}
                              onChange={(e) => setRemember(e.target.checked)}
                            />
                            Keep me signed in
                          </label>
                          {/* {mode === "signin" && (
                            <a
                              href="#/login"
                              className="text-sky-700 hover:underline"
                            >
                              Forgot password?
                            </a>
                          )} */}
                        </div>

                        <motion.button
                          whileTap={{ scale: 0.98 }}
                          disabled={loading}
                          type="submit"
                          className="w-full rounded-xl px-3 py-3 text-sm text-white bg-emerald-600 hover:bg-emerald-500 focus:ring-2 focus:ring-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_8px_24px_rgba(16,185,129,.35)]"
                        >
                          {loading ? (
                            <Spinner />
                          ) : mode === "signin" ? (
                            "Sign in"
                          ) : (
                            "Create account"
                          )}
                        </motion.button>
                      </motion.div>
                    </AnimatePresence>
                  </form>
                </CardBody>
              </Card>
            </div>
          </div>

          <div className="mt-4 text-center text-xs text-slate-500">
            © {new Date().getFullYear()} LedgerFlow
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- Background & Image --------------------------- */
function BGTexture() {
  return (
    <>
      <style>{`
        @keyframes float { 0%{transform:translate3d(0,0,0) scale(1)} 50%{transform:translate3d(0,-6px,0) scale(1.02)} 100%{transform:translate3d(0,0,0) scale(1)}
        }
        .lf-float { animation: float 8s ease-in-out infinite; }
        .lf-grain {
          background-image:
            radial-gradient(rgba(0,0,0,0.03) 1px, transparent 1px),
            radial-gradient(rgba(0,0,0,0.025) 1px, transparent 1px);
          background-position: 0 0, 10px 10px;
          background-size: 20px 20px, 20px 20px;
          mix-blend-mode: multiply;
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 lf-grain" />
    </>
  );
}
function HeroImage() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <svg
        viewBox="0 0 1200 1200"
        className="h-full w-full object-cover"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
          <radialGradient id="glow" cx="50%" cy="35%" r="60%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          <filter id="b" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="30" />
          </filter>
        </defs>
        <rect x="0" y="0" width="1200" height="1200" fill="url(#glow)" />
        <g filter="url(#b)" opacity="0.9">
          <path
            d="M150,250 C380,180 520,260 640,210 C820,130 990,210 980,400 C970,590 760,650 590,720 C420,790 220,890 160,720 C120,610 120,490 150,250 Z"
            fill="url(#g1)"
          />
          <path
            d="M80,760 C200,720 320,760 420,710 C560,640 700,700 720,830 C740,960 640,1050 510,1080 C380,1110 220,1080 160,980 C120,910 110,840 80,760 Z"
            fill="#60a5fa"
            opacity="0.55"
          />
          <path
            d="M760,180 C860,160 960,210 1020,280 C1080,350 1100,450 1020,530 C940,610 820,640 700,610 C580,580 520,460 560,360 C600,260 660,200 760,180 Z"
            fill="#10b981"
            opacity="0.45"
          />
        </g>
        <g opacity="0.18">
          {Array.from({ length: 50 }).map((_, r) => (
            <g key={r}>
              {Array.from({ length: 30 }).map((_, c) => (
                <circle
                  key={c}
                  cx={20 + c * 36}
                  cy={40 + r * 24}
                  r="2.2"
                  fill="#93a3b8"
                />
              ))}
            </g>
          ))}
        </g>
      </svg>
      <div className="absolute inset-0 bg-gradient-to-r from-white/60 via-white/40 to-transparent" />
    </div>
  );
}
function DottedOverlay({ intensity = 0.2 }) {
  return (
    <svg
      className="pointer-events-none absolute inset-0"
      style={{ opacity: intensity }}
      aria-hidden="true"
    >
      <defs>
        <pattern
          id="dots"
          x="0"
          y="0"
          width="18"
          height="18"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1.5" cy="1.5" r="1.5" fill="#94a3b8" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dots)" />
    </svg>
  );
}

/* ----------------------------- Small UI bits ----------------------------- */
function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white align-[-2px]" />
  );
}
function Dot({ ok }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        ok ? "bg-emerald-500" : "bg-slate-300"
      }`}
    />
  );
}
function IconEmail() {
  return (
    <svg
      className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M4 6h16v12H4z" />
      <path d="M4 8l8 5 8-5" />
    </svg>
  );
}
function IconLock() {
  return (
    <svg
      className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M7 11h10v9H7z" />
      <path d="M9 11V8a3 3 0 0 1 6 0v3" />
    </svg>
  );
}
function IconTenant() {
  return (
    <svg
      className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M3 20h18" />
      <path d="M5 20V8l7-5 7 5v12" />
      <path d="M9 20V10h6v10" />
    </svg>
  );
}
function IconBuilding() {
  return (
    <svg
      className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M3 21h18" />
      <path d="M9 8h6v13H9z" />
      <path d="M3 21V10l6-2v13" />
      <path d="M21 21V6l-6 2" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg
      className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="12" cy="7" r="3" />
      <path d="M5 21a7 7 0 0 1 14 0" />
    </svg>
  );
}
function LogoMark() {
  return (
    <div className="relative h-20 w-20 lf-float">
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500 to-sky-500 shadow-[0_16px_48px_rgba(16,185,129,.45)]" />
      <div className="absolute inset-0 rounded-2xl bg-white/10 backdrop-blur-sm ring-1 ring-white/20" />
      <div className="absolute inset-0 grid place-items-center text-white text-3xl font-bold select-none">
        ₹
      </div>
    </div>
  );
}
function MiniLogo() {
  return (
    <span className="inline-grid h-7 w-7 place-items-center rounded-xl bg-gradient-to-br from-emerald-600 to-sky-600 text-white text-sm font-semibold">
      ₹
    </span>
  );
}
