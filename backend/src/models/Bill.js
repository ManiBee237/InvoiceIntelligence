import mongoose from 'mongoose';

const BillLineSchema = new mongoose.Schema(
  {
    description: { type: String, trim: true },
    qty:        { type: Number, default: 0 },
    rate:       { type: Number, default: 0 },
    amount:     { type: Number, default: 0 },
  },
  { _id: false }
);

const BillSchema = new mongoose.Schema(
  {
    tenantId:  { type: String, required: true, index: true },                  // tenant slug/id from x-tenant-id
    vendorId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true, required: true },

    billNo:    { type: String, index: true },                                   // e.g., BILL-202510-0001
    billDate:  { type: Date, required: true },
    dueDate:   { type: Date },

    lines:     { type: [BillLineSchema], default: [] },
    subtotal:  { type: Number, default: 0 },
    tax:       { type: Number, default: 0 },                                    // tax amount
    total:     { type: Number, default: 0 },

    status:    { type: String, enum: ['draft','open','approved','paid','void'], default: 'draft' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id?.toString();
        // normalize dates to YYYY-MM-DD for frontend
        if (ret.billDate instanceof Date) ret.billDate = ret.billDate.toISOString().slice(0,10);
        if (ret.dueDate  instanceof Date) ret.dueDate  = ret.dueDate.toISOString().slice(0,10);
        // keep vendor denorm fields if populated in route
        delete ret._id; delete ret.__v;
        return ret;
      },
    },
  }
);

BillSchema.index({ tenantId: 1, billNo: 1 }, { unique: false });

export default mongoose.model('Bill', BillSchema);
