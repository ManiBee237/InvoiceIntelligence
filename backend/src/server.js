// src/server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import { connectDB, dbState } from './config/db.js';
import authRoute from './routes/auth.js';
import { tenantMiddleware } from './middleware/tenant.js';

// NOTE: include only the routes you actually have
import productsRoute from './routes/products.js';
import invoicesRoute from './routes/invoices.js';
import billsRoute from './routes/bills.js';
import paymentsRoute from './routes/payments.js';   // if you have it
import customersRoute from './routes/customers.js'; // if you have it
import vendorsRoute from './routes/vendors.js';     // if you have it
import dashboardRoute from './routes/dashboard.js'
import reportsRoute from './routes/reports.js'
import mlRoute from './routes/ml.js'

const app = express();

/* ---------------------- CORS CONFIG (this was missing) ---------------------- */
const allowlist = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim());

const corsCfg = {
  origin(origin, cb) {
    // allow non-browser clients or same-origin
    if (!origin) return cb(null, true);
    return cb(null, allowlist.includes(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'x-user-id'],
  exposedHeaders: ['x-total-count'],
};

app.use(cors(corsCfg));
app.options('*', cors(corsCfg)); // handle preflight

app.use(express.json());
app.use(morgan('dev'));

app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
  <html><head><meta charset="utf-8"><title>LedgerFlow API</title>
  <style>body{font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Inter,sans-serif;padding:24px;color:#0f172a}</style>
  </head><body>
    <h1>LedgerFlow API</h1>
    <ul>
      <li><a href="/health">/health</a></li>
      <li><a href="/_routes">/_routes</a></li>
      <li><code>/api/*</code> endpoints require <code>x-tenant-id</code> (and usually a Bearer token).</li>
    </ul>
  </body></html>`);
});

/* ------------------------------- Health routes ------------------------------ */
app.get('/health', (_req, res) => res.json({ ok: true, db: dbState() }));
app.get('/api/health', (_req, res) => res.json({ ok: true, db: dbState() }));
app.get('/_routes', (_req, res) => {
  const out = [];
  const walk = (p, layer) => {
    if (layer.route?.path) {
      const methods = Object.keys(layer.route.methods)
        .map(m => m.toUpperCase())
        .join(',');
      out.push(`${methods} ${p}${layer.route.path}`);
    } else if (layer.name === 'router' && layer.handle.stack) {
      layer.handle.stack.forEach(l =>
        walk(p + (layer.regexp?.fast_star ? '*' : layer.regexp?.fast_slash ? '/' : ''), l)
      );
    }
  };
  app._router.stack.forEach(l => walk('', l));
  res.json(out);
});

/* -------------------------- Public (no tenant header) ----------------------- */
app.use('/api/auth', authRoute);

/* ------------------------- Tenant-protected API root ------------------------ */

app.use('/api', tenantMiddleware);

app.use('/api/products', productsRoute);
app.use('/api/invoices', invoicesRoute);
app.use('/api/bills', billsRoute);

// Include these only if present; otherwise remove/comment them
app.use('/api/payments', paymentsRoute);
app.use('/api/customers', customersRoute);
app.use('/api/vendors', vendorsRoute);
app.use('/api/dashboard', dashboardRoute)
app.use('/api/reports', reportsRoute)    
app.use('/api/ml', mlRoute)    

/* --------------------------------- Start ----------------------------------- */
await connectDB(process.env.MONGODB_URI, process.env.MONGODB_DBNAME);
const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`[server] http://localhost:${port}`));
