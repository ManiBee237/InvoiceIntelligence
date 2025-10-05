// src/server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import { connectDB, dbState } from './config/db.js';
import { tenantMiddleware } from './middleware/tenant.js';

// Routers
import invoicesRoute  from './routes/invoices.js';
import vendorsRoute   from './routes/vendors.js';
import productsRoute  from './routes/products.js';
import billsRoute     from './routes/bills.js';
import customersRoute from './routes/customers.js';
import paymentsRoute  from './routes/payments.js';
import dashboardRoute from './routes/dashboard.js';
import authRoute from './routes/auth.js'
import usersRoute from './routes/users.js'

const app = express();

// ---------- middleware ----------
app.use(cors({
  origin: (process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173']),
  credentials: true,
}));
app.use(express.json());
app.use(morgan('dev'));

// ---------- health (public) ----------
app.get('/health', (_req, res) => {
  res.json({ ok: true, db: dbState() });
});
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, db: dbState() });
});

// Optional: list mounted routes for debugging
app.get('/_routes', (_req, res) => {
  const out = [];
  const walk = (path, layer) => {
    if (layer.route && layer.route.path) {
      const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase()).join(',');
      out.push(`${methods} ${path}${layer.route.path}`);
    } else if (layer.name === 'router' && layer.handle?.stack) {
      layer.handle.stack.forEach(l => walk(path, l));
    }
  };
  app._router.stack.forEach(l => walk('', l));
  res.json(out);
});

app.use('/api/auth', authRoute)

// ---------- tenant-protected APIs ----------
app.use('/api', tenantMiddleware);

app.use('/api/products',  productsRoute);
app.use('/api/dashboard',  dashboardRoute);
app.use('/api/bills',     billsRoute);
app.use('/api/invoices',  invoicesRoute);
app.use('/api/customers', customersRoute);
app.use('/api/payments',  paymentsRoute);
app.use('/api/vendors', vendorsRoute);

// ---------- start ----------
await connectDB(process.env.MONGODB_URI);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`[server] http://localhost:${port}`));
