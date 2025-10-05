import 'dotenv/config';
import { connectDB } from '../src/config/db.js';

import Tenant   from '../src/models/Tenant.js';
import Customer from '../src/models/Customer.js';
import Product  from '../src/models/Product.js';
import Vendor   from '../src/models/Vendor.js';
import Bill     from '../src/models/Bill.js';
import Invoice  from '../src/models/Invoice.js';
import Payment  from '../src/models/Payment.js';

async function main() {
  await connectDB(process.env.MONGODB_URI);
  const models = [Tenant, Customer, Product, Vendor, Bill, Invoice, Payment];
  for (const m of models) {
    await m.syncIndexes();
    console.log(`[indexes] synced for ${m.modelName}`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
