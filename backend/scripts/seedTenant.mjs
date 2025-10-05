// backend/scripts/seedTenant.mjs
import "dotenv/config.js";
import mongoose from "mongoose";
import Tenant from "../src/models/Tenant.js";

const MONGO = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ledgerflow";
await mongoose.connect(MONGO);

const t = await Tenant.create({ name: "Demo Tenant", code: "demo" });
console.log("Tenant created:", t._id.toString(), "code:", t.code);

await mongoose.disconnect();
