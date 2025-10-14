// backend/src/models/invoice.js
import mongoose from 'mongoose';

const LineSchema = new mongoose.Schema(
  {
    description: { type: String, trim: true, default: '' },
    qty: { type: Number, min: 0, default: 0 },
    rate: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const InvoiceSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },

    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    customerName: { type: String, trim: true },

    number: { type: String, trim: true, index: true },
    invoiceNo: { type: String, trim: true, index: true },

    invoiceDate: { type: Date, required: true, default: () => new Date() },
    dueDate: { type: Date },

    lines: { type: [LineSchema], default: [] },
    subtotal: { type: Number, min: 0, default: 0 },
    tax: { type: Number, min: 0, default: 0 },
    total: { type: Number, min: 0, default: 0 },

    status: { type: String, enum: ['open', 'overdue', 'paid'], default: 'open', index: true },
  },
  { timestamps: true }
);

InvoiceSchema.pre('save', function (next) {
  if (this.number && !this.invoiceNo) this.invoiceNo = this.number;
  if (this.invoiceNo && !this.number) this.number = this.invoiceNo;
  next();
});

export default mongoose.models.Invoice || mongoose.model('Invoice', InvoiceSchema);
