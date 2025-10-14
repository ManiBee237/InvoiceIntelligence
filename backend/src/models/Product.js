import mongoose from 'mongoose';

const ProductSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },     // from x-tenant-id
    name:     { type: String, required: true, trim: true },
    sku:      { type: String, trim: true },                       // optional
    price:    { type: Number, required: true, min: 0 },
    unit:     { type: String, default: 'pcs' },                   // optional
    stock:    { type: Number, default: 0, min: 0 },               // optional
    taxPct:   { type: Number, default: 0, min: 0 },               // optional
    hsn:      { type: String, trim: true },                       // optional
    desc:     { type: String, trim: true },                       // optional
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Uniqueness within a tenant (adjust if you prefer sku instead)
ProductSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export default mongoose.model('Product', ProductSchema);
