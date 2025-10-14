// src/models/Invoice.js
import mongoose from 'mongoose';

const LineSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    qty:   { type: Number, required: true, min: 0 },
    rate:  { type: Number, required: true, min: 0 },
    amount:{ type: Number, required: true, min: 0 },
  },
  { _id: false }
);

// ...rest unchanged...
const InvoiceSchema = new mongoose.Schema(
  {
    tenantId:   { type: String, required: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    invoiceNo:  { type: String, required: true, trim: true },
    invoiceDate:{ type: Date,   required: true },
    lines:      { type: [LineSchema], default: [] },
    subtotal:   { type: Number, required: true, min: 0 },
    tax:        { type: Number, required: true, min: 0 },
    total:      { type: Number, required: true, min: 0 },
    status:     { type: String, enum: ['draft','sent','paid','void'], default: 'draft' },
    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // <-- add
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id?.toString();
        delete ret._id;
        delete ret.__v;
        if (ret.invoiceDate instanceof Date) {
          ret.invoiceDate = ret.invoiceDate.toISOString().slice(0,10);
        }
        return ret;
      },
    },
  }
);
// ...index & export unchanged...


export default mongoose.model('Invoice', InvoiceSchema);
