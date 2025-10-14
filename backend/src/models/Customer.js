// src/models/Customer.js
import mongoose from 'mongoose';

const AddressSchema = new mongoose.Schema(
  {
    line1: { type: String, trim: true },
    line2: { type: String, trim: true },
    city:  { type: String, trim: true },
    state: { type: String, trim: true },
    zip:   { type: String, trim: true },
    country: { type: String, trim: true },
  },
  { _id: false }
);

const CustomerSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    name:     { type: String, required: true, trim: true },
    email:    { type: String, trim: true, lowercase: true },
    phone:    { type: String, trim: true },
    gstin:    { type: String, trim: true },
    billing:  { type: AddressSchema, default: {} },
    shipping: { type: AddressSchema, default: {} },
    notes:    { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy:{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // <-- add
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id?.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// unique per-tenant by name; also sparse unique email per-tenant if provided
CustomerSchema.index({ tenantId: 1, name: 1 }, { unique: true });
CustomerSchema.index({ tenantId: 1, email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });

export default mongoose.model('Customer', CustomerSchema);
