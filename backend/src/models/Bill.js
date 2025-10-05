import mongoose from 'mongoose';

const BillSchema = new mongoose.Schema(
  {
    tenantId:   { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    id:         { type: String, trim: true, index: true }, // optional human id BILL-..
    vendorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    vendorName: { type: String, default: '' }, // denormalized for quick listing
    date:       { type: Date, required: true },
    due:        { type: Date, required: true },
    amount:     { type: Number, required: true, min: 0 },
    status:     { type: String, enum: ['Open', 'Overdue', 'Paid'], default: 'Open', index: true },
    isDeleted:  { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

BillSchema.index({ tenantId: 1, id: 1 }, { unique: true, sparse: true });
BillSchema.index({ tenantId: 1, status: 1, due: 1 });

export default mongoose.model('Bill', BillSchema);
