// src/scripts/seedTenant.js
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Tenant from '../models/Tenant.js';

const raw = process.argv[2] || process.env.TENANT_CODE || 'mani';
const slug = String(raw).trim().toLowerCase();
const name = process.argv[3] || process.env.TENANT_NAME || 'Mani Tenant';

(async () => {
  try {
    await connectDB(process.env.MONGODB_URI, process.env.MONGODB_DBNAME);
    const doc = await Tenant.findOneAndUpdate(
      { $or: [{ slug }, { code: slug }] },
      { $set: { slug, code: slug, name } },
      { upsert: true, new: true }
    ).select('_id slug code name');
    console.log(`[seed] tenant ready: ${doc._id} slug=${doc.slug} code=${doc.code} name="${doc.name}"`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error('[seed] failed:', e);
    process.exit(1);
  }
})();
