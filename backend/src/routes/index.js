import { Router } from 'express';
import bootstrap from './bootstrap.js';
import customers from './customers.js';
import invoices from './invoices.js';
import payments from './payments.js';
import products from './products.js';
import users from './users.js';
import vendors from './vendors.js';
import bills from './bills.js';              // ← add

const api = Router();

api.use('/bootstrap', bootstrap);
api.use('/customers', customers);
api.use('/invoices', invoices);
api.use('/payments', payments);
api.use('/products', products);
api.use('/users', users);
api.use('/vendors', vendors);
api.use('/bills', bills);                    // ← add

export default api;
