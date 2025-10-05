import mongoose from 'mongoose';

const ProductSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    id:       { type: String, trim: true, index: true }, // optional human id (PR-..)
    sku:      { type: String, trim: true, default: '' },
    name:     { type: String, required: true, trim: true, index: true },
    price:    { type: Number, required: true, min: 0 },
    gstPct:   { type: Number, default: 0, min: 0 },
    stock:    { type: Number, default: 0, min: 0 },
    isDeleted:{ type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

ProductSchema.index({ tenantId: 1, name: 1 });
ProductSchema.index({ tenantId: 1, sku: 1 }, { unique: true, sparse: true });
ProductSchema.index({ tenantId: 1, id: 1 }, { unique: true, sparse: true });

export default mongoose.model('Product', ProductSchema);
