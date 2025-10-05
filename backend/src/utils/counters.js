import mongoose from 'mongoose'
const Counter = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  key: { type: String, required: true }, // 'INV' | 'RCPT' | 'BILL'
  next: { type: Number, default: 1 }
}, { collection: 'counters' })
Counter.index({ tenantId: 1, key: 1 }, { unique: true })
export const CounterModel = mongoose.model('Counter', Counter)

export async function nextNumber(tenantId, key) {
  const doc = await CounterModel.findOneAndUpdate(
    { tenantId, key },
    { $inc: { next: 1 } },
    { new: true, upsert: true }
  )
  const seq = doc.next - 1
  return String(seq).padStart(6, '0')
}
