// src/models/Invoice.js
import mongoose from 'mongoose'

const ItemSchema = new mongoose.Schema(
  {
    description: { type: String, trim: true },
    qty: { type: Number, default: 1, min: 0 },
    unitPrice: { type: Number, default: 0, min: 0 },
    gst: { type: Number, default: 0, min: 0 }, // % (optional)
  },
  { _id: false }
)

// backend/src/models/Invoice.js  (add if missing)
const InvoiceSchema = new mongoose.Schema({
  tenantId:     { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  number:       { type: String, required: true, index: true }, // add unique per tenant below
  customerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String },
  customerEmail:{ type: String },
  date:         { type: Date, required: true },
  dueDate:      { type: Date, required: true },
  items: [{
    description: String,
    qty:        Number,
    unitPrice:  Number,
    gst:        Number,
  }],
  subTotal:     { type: Number, default: 0 },
  taxTotal:     { type: Number, default: 0 },
  total:        { type: Number, default: 0 },
  balance:      { type: Number, default: 0 },
  status:       { type: String, default: 'Open', index: true },
  notes:        { type: String },
}, { timestamps: true });

InvoiceSchema.index({ tenantId: 1, number: 1 }, { unique: true });

export default mongoose.models.Invoice || mongoose.model('Invoice', InvoiceSchema);
