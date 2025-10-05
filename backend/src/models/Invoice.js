import mongoose from 'mongoose';

const ItemSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, trim: true },
    qty:       { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    gstPct:    { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const InvoiceSchema = new mongoose.Schema(
  {
    tenantId:     { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    number:       { type: String, required: true, trim: true }, // INV-YYYYMM-####
    customerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    customerName: { type: String, default: '' }, // denormalized
    date:         { type: Date, required: true },
    dueDate:      { type: Date, required: true },
    status:       { type: String, enum: ['Open', 'Overdue', 'Paid'], default: 'Open', index: true },
    items:        { type: [ItemSchema], default: [] },
    total:        { type: Number, required: true, min: 0 },
    isDeleted:    { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// per-tenant unique invoice number
InvoiceSchema.index({ tenantId: 1, number: 1 }, { unique: true });

// helper: recompute total if missing
InvoiceSchema.pre('validate', function(next) {
  if (!this.total && Array.isArray(this.items)) {
    this.total = this.items.reduce((sum, it) => {
      const up = Number(it.unitPrice) || 0;
      const q  = Number(it.qty) || 0;
      const g  = Number(it.gstPct) || 0;
      return sum + Math.round(up * q * (1 + g / 100));
    }, 0);
  }
  next();
});

export default mongoose.model('Invoice', InvoiceSchema);
