// backend/src/models/_plugins.js
import mongoose from "mongoose";
const { Schema } = mongoose;

export function tenantPlugin(schema) {
  schema.add({
    tenantId:  { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  });
  schema.set("timestamps", true);

  // optional auto fill if route sets doc.$locals.tenantId
  schema.pre("save", function (next) {
    if (!this.tenantId && this.$locals?.tenantId) this.tenantId = this.$locals.tenantId;
    next();
  });
}
