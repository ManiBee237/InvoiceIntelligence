import mongoose from 'mongoose';

const CustomerSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    id:       { type: String, trim: true, index: true }, // optional human id (CUS-..)
    name:     { type: String, required: true, trim: true, index: true },
    email:    { type: String, required: true, trim: true },
    phone:    { type: String, default: '' },
    address:  { type: String, default: '' },
    isDeleted:{ type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

CustomerSchema.index({ tenantId: 1, email: 1 }, { unique: true });
CustomerSchema.index({ tenantId: 1, id: 1 }, { unique: true, sparse: true });

export default mongoose.model('Customer', CustomerSchema);
