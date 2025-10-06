import mongoose from 'mongoose'
const { Schema, Types } = mongoose

const CustomerSchema = new Schema({
  tenantId: { type: Types.ObjectId, required: true, index: true },
  name:     { type: String, required: true, trim: true },
  email:    { type: String, trim: true, lowercase: true },
  phone:    { type: String, trim: true },
  address:  { type: String, trim: true },
  // use "code" for your human id like "CUS-202510-9305"
  code:     { type: String, trim: true },
}, { timestamps: true })

CustomerSchema.index({ tenantId: 1, email: 1 }, { unique: true, sparse: true })
CustomerSchema.index({ tenantId: 1, code: 1  }, { unique: true, sparse: true })
// If you DON'T want names unique, remove the next line:
CustomerSchema.index({ tenantId: 1, name: 1 }, { unique: true })

export default mongoose.model('Customer', CustomerSchema)
