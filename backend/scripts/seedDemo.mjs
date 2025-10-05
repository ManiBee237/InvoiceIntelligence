// backend/scripts/seedDemo.mjs
import "dotenv/config.js";
import mongoose from "mongoose";
import Tenant from "../src/models/Tenant.js";
import Customer from "../src/models/Customer.js";
import Invoice from "../src/models/Invoice.js";

const MONGO = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ledgerflow";
await mongoose.connect(MONGO);

let tenant = await Tenant.findOne({ code: "demo" });
if (!tenant) tenant = await Tenant.create({ name: "Demo Tenant", code: "demo" });

const tId = tenant._id;
console.log("Using tenant:", tId.toString(), "code:", tenant.code);

// customers
const customers = await Customer.insertMany([
  { name: "Acme Pvt Ltd", email: "billing@acme.com", phone: "900000001", address: "Chennai", tenantId: tId },
  { name: "Globex India", email: "ap@globex.com", phone: "900000002", address: "Bengaluru", tenantId: tId },
  { name: "Soylent Corp", email: "acc@soylent.com", phone: "900000003", address: "Hyderabad", tenantId: tId },
], { ordered: false }).catch(()=>{});

const pick = (arr) => arr[Math.floor(Math.random()*arr.length)];
const names = ["Audit Service", "AMC Support", "Consulting", "Implementation"];
const custs = await Customer.find({ tenantId: tId }).lean();

const mkItem = () => ({
  name: pick(names),
  qty: Math.ceil(Math.random() * 3),
  unitPrice: 2500 + Math.ceil(Math.random() * 5000),
  gstPct: 18
});

const docs = [];
for (let i = 0; i < 10; i++) {
  const c = pick(custs);
  const d = new Date(); d.setDate(d.getDate() - Math.ceil(Math.random()*20));
  const due = new Date(d); due.setDate(due.getDate() + (7 + Math.ceil(Math.random()*14)));
  const items = [mkItem(), mkItem()];
  const total = items.reduce((s, it)=> s + Math.round(it.unitPrice*it.qty*(1+it.gstPct/100)), 0);
  const status = pick(["Open","Paid","Open","Overdue"]); // skew to Open

  docs.push({
    number: `INV-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}-${String(1000+i)}`,
    customerId: c?._id,
    customerName: c?.name,
    date: d,
    dueDate: due,
    status,
    items,
    total,
    tenantId: tId
  });
}

await Invoice.insertMany(docs, { ordered: false }).catch(()=>{});
console.log("Seeded invoices:", docs.length);

await mongoose.disconnect();
console.log("Done.");
