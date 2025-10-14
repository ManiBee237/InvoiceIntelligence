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

import invoiceRoutes from './routes/invoices.js';
import customerRoutes from './routes/customers.js';
import paymentRoutes from './routes/payments.js';
import productRoutes from './routes/products.js';
import vendorRoutes from './routes/vendors.js';
import billRoutes from './routes/bills.js';

const app = express();
app.use(cors({ origin: /localhost:5173$/, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

await connectDB();

app.use('/api/invoices', invoiceRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/products', productRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/bills', billRoutes);

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on :${port}`));
