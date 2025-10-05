import mongoose from 'mongoose'

const TenantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true, index: true },
  isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true })

export default mongoose.model('Tenant', TenantSchema)
