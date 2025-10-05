import mongoose from 'mongoose'
const { Schema } = mongoose

const UserSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  email:     { type: String, required: true, lowercase: true, trim: true },
  name:      { type: String, default: '' },
  passwordHash: { type: String, required: true },
  roles:        [{ type: String }],
  isActive:     { type: Boolean, default: true },
  lastLoginAt:  Date,
}, { timestamps: true })

// one email per tenant
UserSchema.index({ tenantId: 1, email: 1 }, { unique: true })

UserSchema.methods.toJSON = function () {
  const o = this.toObject()
  delete o.passwordHash
  return o
}

export default mongoose.model('User', UserSchema)
