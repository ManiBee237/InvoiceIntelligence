// backend/src/routes/index.js
import { Router } from "express";
import invoices from "./invoices.js";
import customers from "./customers.js";
import dashboard from "./dashboard.js";
import payments from "./payments.js";
import products from "./products.js";
import vendors from "./vendors.js";
import bills from "./bills.js";

const r = Router();
r.use("/invoices", invoices);
r.use("/customers", customers);
r.use("/dashboard", dashboard);
r.use("/payments", payments);
r.use("/products", products);
r.use("/vendors", vendors);
r.use("/bills", bills);

export default r;
