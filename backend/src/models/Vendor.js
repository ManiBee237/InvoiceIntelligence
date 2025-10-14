import mongoose from 'mongoose';

const VendorSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true }, // tenant slug
    name:     { type: String, required: true, trim: true },
    email:    { type: String, trim: true, lowercase: true },
    phone:    { type: String, trim: true },
    gstin:    { type: String, trim: true },
    billing:  {
      line1: String, line2: String, city: String, state: String, zip: String, country: String
    },
    shipping: {
      line1: String, line2: String, city: String, state: String, zip: String, country: String
    },
    notes:    { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy:{ type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id?.toString();
        delete ret._id; delete ret.__v;
        return ret;
      },
    },
  }
);

VendorSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export default mongoose.model('Vendor', VendorSchema);
