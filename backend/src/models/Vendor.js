import mongoose from 'mongoose';

const VendorSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    name:     { type: String, required: true, trim: true, index: true },
    city:     { type: String, default: '', trim: true },
    email:    { type: String, default: '', trim: true },
    phone:    { type: String, default: '', trim: true },
    isDeleted:{ type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

VendorSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export default mongoose.model('Vendor', VendorSchema);
