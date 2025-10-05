import mongoose from 'mongoose';

const PaymentSchema = new mongoose.Schema(
  {
    tenantId:   { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    id:         { type: String, trim: true, index: true }, // PM-YYMMDD-XXXXX
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    customer:   { type: String, required: true, trim: true }, // denormalized name
    invoice:    { type: String, default: '' }, // invoice number if provided
    date:       { type: Date, required: true },
    method:     { type: String, enum: ['UPI', 'Bank', 'Card', 'Cash'], default: 'UPI', index: true },
    amount:     { type: Number, required: true, min: 1 },
    isDeleted:  { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

PaymentSchema.index({ tenantId: 1, id: 1 }, { unique: true, sparse: true });
PaymentSchema.index({ tenantId: 1, date: 1 });

export default mongoose.model('Payment', PaymentSchema);
