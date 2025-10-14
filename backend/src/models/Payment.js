import mongoose from 'mongoose';

const PaymentSchema = new mongoose.Schema(
  {
    tenantId:  { type: String, required: true, index: true },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },

    amount:    { type: Number, required: true, min: 0 },
    date:      { type: Date, required: true, default: () => new Date() },
    method:    { type: String, trim: true }, // e.g. UPI, Card, Cash, Bank Transfer
    notes:     { type: String, trim: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id?.toString();
        delete ret._id;
        delete ret.__v;
        if (ret.date instanceof Date) {
          ret.date = ret.date.toISOString().slice(0, 10);
        }
        return ret;
      },
    },
  }
);

// For fast queries by tenant + invoice
PaymentSchema.index({ tenantId: 1, invoiceId: 1 });

export default mongoose.model('Payment', PaymentSchema);
