// backend/src/models/Counter.js
import mongoose from 'mongoose';

const CounterSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    key:      { type: String, required: true, index: true }, // e.g. "INV-202510"
    seq:      { type: Number, default: 0 },
  },
  { versionKey: false, timestamps: false, collection: 'counters' }
);

// Prevent duplicate (tenantId, key) docs
CounterSchema.index({ tenantId: 1, key: 1 }, { unique: true });

// Hot-reload safe in dev (nodemon)
export default mongoose.models.Counter || mongoose.model('Counter', CounterSchema);
