import mongoose from 'mongoose';

const TenantSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    currency: { type: String, default: 'INR' },
    timezone: { type: String, default: 'Asia/Kolkata' },
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

export default mongoose.model('Tenant', TenantSchema);
