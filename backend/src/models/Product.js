// backend/src/models/Product.js
import mongoose from 'mongoose';

const ProductSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },

  // Human-facing code like "PROD-202510-0001" (unique per tenant)
  code: { type: String, trim: true, index: true },

  name: { type: String, trim: true, required: true },
  sku:  { type: String, trim: true },
  unit: { type: String, trim: true, default: 'unit' },

  unitPrice: { type: Number, default: 0 },
  gst:       { type: Number, default: 0 },

  description: { type: String, trim: true, default: '' },
  active:      { type: Boolean, default: true },
}, { timestamps: true });

// Unique per tenant if provided (sparse allows null/undefined)
ProductSchema.index({ tenantId: 1, code: 1 }, { unique: true, sparse: true });
ProductSchema.index({ tenantId: 1, name: 1 });

export default mongoose.model('Product', ProductSchema);
