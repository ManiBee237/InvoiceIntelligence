import mongoose from 'mongoose';

/* -------- Bill line -------- */
const BillLineSchema = new mongoose.Schema(
  {
    description: { type: String, trim: true },
    qty:        { type: Number, default: 0 },
    rate:       { type: Number, default: 0 },
    amount:     { type: Number, default: 0 },
  },
  { _id: false }
);

/* -------- Counters (per-tenant sequences) -------- */
const CounterSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    name:     { type: String, required: true },
    seq:      { type: Number, default: 0 },
  },
  { timestamps: false, collection: 'counters' }
);

const Counter =
  mongoose.models.Counter || mongoose.model('Counter', CounterSchema);

/* -------- Bill -------- */
const BillSchema = new mongoose.Schema(
  {
    tenantId:  { type: String, required: true, index: true },
    vendorId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },

    billNo:    { type: String, required: true, index: true },

    billDate:  { type: Date, required: true },
    dueDate:   { type: Date },

    lines:     { type: [BillLineSchema], default: [] },
    subtotal:  { type: Number, default: 0 },
    tax:       { type: Number, default: 0 },
    total:     { type: Number, default: 0 },

    /* 🔒 Only allow: open, overdue, paid */
    status:    { type: String, enum: ['open', 'overdue', 'paid'], default: 'open' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id?.toString();
        if (ret.billDate instanceof Date) ret.billDate = ret.billDate.toISOString().slice(0,10);
        if (ret.dueDate  instanceof Date) ret.dueDate  = ret.dueDate.toISOString().slice(0,10);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    collection: 'bills'
  }
);

/* Unique per-tenant bill number */
BillSchema.index({ tenantId: 1, billNo: 1 }, { unique: true });

/* Counter helper */
async function getNextSequence(tenantId, name = 'bill') {
  const filter = { tenantId, name };
  const update = { $inc: { seq: 1 } };
  const opts   = { upsert: true, new: true, setDefaultsOnInsert: true };
  const doc = await Counter.findOneAndUpdate(filter, update, opts);
  return doc.seq;
}

/* Auto-generate billNo */
BillSchema.pre('validate', async function(next) {
  try {
    if (this.billDate && !(this.billDate instanceof Date)) this.billDate = new Date(this.billDate);
    if (this.dueDate  && !(this.dueDate  instanceof Date)) this.dueDate  = new Date(this.dueDate);

    if (!this.billNo) {
      const seq = await getNextSequence(this.tenantId, 'bill');
      const now = new Date();
      const y   = now.getFullYear();
      const m   = String(now.getMonth() + 1).padStart(2, '0');
      const padded = String(seq).padStart(4, '0');
      this.billNo = `BILL-${y}${m}-${padded}`;
    }

    next();
  } catch (err) {
    next(err);
  }
});

export default mongoose.models.Bill || mongoose.model('Bill', BillSchema);
