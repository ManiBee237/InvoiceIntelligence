// backend/src/server.js
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import connectDB from './config/db.js';

// register models first
import './models/Customer.js';
import './models/Invoice.js';
import './models/Payment.js';
import './models/Product.js';
import './models/Vendor.js';
import './models/Bill.js';

import authRoutes from './routes/auth.js';
import invoiceRoutes from './routes/invoices.js';
import customerRoutes from './routes/customers.js';
import paymentRoutes from './routes/payments.js';
import productRoutes from './routes/products.js';
import vendorRoutes from './routes/vendors.js';
import billRoutes from './routes/bills.js';
import reportRoutes from './routes/reports.js';
import mlRoutes from './routes/ml.js';

const app = express();
app.use(cors({ origin: /localhost:5173$/, credentials: true }));
app.use(express.json());
app.use((req, res, next) => {
  if (req.path.startsWith('/api/auth')) return next();
  const tenantId = (req.headers['x-tenant-id'] || '').toString().trim().toLowerCase();
  if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
  req.tenantId = tenantId;
  next();
});
app.use(morgan('dev'));

await connectDB();
app.use('/api/auth', authRoutes); 

app.use('/api/invoices', invoiceRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/products', productRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/ml', mlRoutes);

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((req, res, next) => {
  if (req.path.startsWith('/api/auth')) return next(); // let auth handle its own logic
  const tenantId = (req.headers['x-tenant-id'] || '').toString().trim().toLowerCase();
  if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
  req.tenantId = tenantId;
  next();
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on :${port}`));
