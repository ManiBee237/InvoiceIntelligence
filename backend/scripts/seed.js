import 'dotenv/config';
import { connectDB } from '../src/config/db.js';

import Tenant   from '../src/models/Tenant.js';
import Customer from '../src/models/Customer.js';
import Product  from '../src/models/Product.js';
import Vendor   from '../src/models/Vendor.js';
import Bill     from '../src/models/Bill.js';
import Invoice  from '../src/models/Invoice.js';
import Payment  from '../src/models/Payment.js';

function dDays(n) {
  const d = new Date(); d.setDate(d.getDate() + n); return d;
}

async function main() {
  await connectDB(process.env.MONGODB_URI);

  // 1) tenant
  let tenant = await Tenant.findOneAndUpdate(
    { slug: 'demo' },
    { $setOnInsert: { name: 'Demo Tenant' } },
    { new: true, upsert: true }
  );
  const tenantId = tenant._id;

  // 2) customers
  const customers = await Customer.insertMany([
    { tenantId, id: 'CUS-ACME', name: 'Acme Pvt Ltd',   email: 'billing@acme.com',    phone: '900000001', address: 'Chennai' },
    { tenantId, id: 'CUS-GLOB', name: 'Globex India',   email: 'ap@globex.com',       phone: '900000002', address: 'Bengaluru' },
    { tenantId, id: 'CUS-SOYL', name: 'Soylent Corp',   email: 'acc@soylent.com',     phone: '900000003', address: 'Hyderabad' },
  ], { ordered: false }).catch(() => []); // ignore dup errors

  // 3) products
  await Product.insertMany([
    { tenantId, id: 'PR-CONSULT', name: 'Consulting',    price: 5000,  gstPct: 18, stock: 10 },
    { tenantId, id: 'PR-IMPL',    name: 'Implementation',price: 6500,  gstPct: 18, stock: 5  },
    { tenantId, id: 'PR-AMC',     name: 'AMC Support',   price: 3000,  gstPct: 18, stock: 20 },
    { tenantId, id: 'PR-AUD',     name: 'Audit Service', price: 3500,  gstPct: 18, stock: 12 },
  ], { ordered: false }).catch(() => []);

  // 4) vendors
  const vendors = await Vendor.insertMany([
    { tenantId, name: 'Paper Supply Co', city: 'Chennai',  email: 'ap@paperco.test' },
    { tenantId, name: 'Cloud Infra Ltd', city: 'Mumbai',   email: 'ap@cloudinfra.test' },
  ], { ordered: false }).catch(() => []);

  // 5) invoices
  const acme = await Customer.findOne({ tenantId, name: 'Acme Pvt Ltd' });
  if (acme) {
    await Invoice.insertMany([
      {
        tenantId, number: 'INV-202510-1006',
        customerId: acme._id, customerName: acme.name,
        date: dDays(-4), dueDate: dDays(+10), status: 'Open',
        items: [
          { name: 'Audit Service', qty: 1, unitPrice: 3221, gstPct: 18 },
          { name: 'Audit Service', qty: 3, unitPrice: 2668, gstPct: 18 },
        ]
      },
    ], { ordered: false }).catch(() => []);
  }

  // 6) bills
  const paper = await Vendor.findOne({ tenantId, name: 'Paper Supply Co' });
  if (paper) {
    await Bill.insertMany([
      { tenantId, id: 'BILL-202510-0001', vendorId: paper._id, vendorName: paper.name, date: dDays(-2), due: dDays(+14), amount: 4200, status: 'Open' },
    ], { ordered: false }).catch(() => []);
  }

  // 7) payments
  if (acme) {
    await Payment.insertMany([
      { tenantId, id: 'PM-251006-ACME1', customerId: acme._id, customer: acme.name, invoice: 'INV-202510-1006', date: dDays(-1), amount: 5000, method: 'UPI' }
    ], { ordered: false }).catch(() => []);
  }

  console.log('[seed] done');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
