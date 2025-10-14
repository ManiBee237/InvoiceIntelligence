import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true }, // tenant slug
    name:     { type: String, required: true, trim: true },
    email:    { type: String, required: true, trim: true, lowercase: true },
    role:     { type: String, enum: ['owner','admin','staff','viewer'], default: 'staff' },
    passwordHash: { type: String, select: false }, // store bcrypt hash
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id?.toString();
        delete ret._id; delete ret.__v; delete ret.passwordHash;
        return ret;
      },
    },
  }
);

UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });

export default mongoose.model('User', UserSchema);
