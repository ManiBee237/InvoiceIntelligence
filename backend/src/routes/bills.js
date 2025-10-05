// backend/src/routes/bills.js
import { Router } from "express";
import mongoose from "mongoose";
import Bill from "../models/Bill.js";
import Vendor from "../models/Vendor.js";

const router = Router();
const dup = (e) => e && e.code === 11000;
const parseDate = (s) => (s ? new Date(s) : undefined);

const toUI = (doc={}) => ({
  _id: String(doc._id || ""),
  id: doc.code || String(doc._id || ""),
  vendorId: doc.vendorId ? String(doc.vendorId) : null,
  vendor: doc.vendorName || "",
  date: doc.date,
  due: doc.due,
  amount: Number(doc.amount || 0),
  status: doc.status || "Open",
});

const fromUI = (b={}) => ({
  code: b.id || undefined,
  vendorName: b.vendor,
  date: parseDate(b.date),
  due: parseDate(b.due),
  amount: Number(b.amount || 0),
  status: b.status,
});

// Try to link vendorId by code or name (optional)
async function linkVendorId(tenantId, vendorField) {
  const q = (vendorField || "").trim();
  if (!q) return null;
  const v = await Vendor.findOne({
    tenantId,
    $or: [{ code: q }, { name: q }],
  }).select("_id").lean();
  return v?._id || null;
}

// LIST ?status=Open|Overdue|Paid & ?q=
router.get("/", async (req,res,next)=>{
  try{
    const q = (req.query.q || "").trim();
    const status = (req.query.status || "").trim();
    const filter = { tenantId: req.tenantId };
    if (status && ["Open","Overdue","Paid"].includes(status)) filter.status = status;
    if (q) {
      filter.$or = [
        { vendorName: { $regex: q, $options: "i" } },
        { code: { $regex: q, $options: "i" } },
      ];
    }
    const docs = await Bill.find(filter).sort({ due: 1 }).limit(1000).lean();
    res.json(docs.map(toUI));
  }catch(e){ next(e); }
});

// CREATE
router.post("/", async (req,res,next)=>{
  try{
    const payload = { ...fromUI(req.body||{}), tenantId: req.tenantId };
    // optional vendorId link
    payload.vendorId = req.body.vendorId || await linkVendorId(req.tenantId, req.body.vendor);
    const doc = await Bill.create(payload);
    res.status(201).json(toUI(doc.toObject()));
  }catch(e){
    if (dup(e)) return res.status(409).json({ error: "Bill ID already exists" });
    if (e?.name === "ValidationError") return res.status(400).json({ error: e.message });
    next(e);
  }
});

// UPDATE (by _id or code)
router.put("/:id", async (req,res,next)=>{
  try{
    const { id } = req.params;
    const match = mongoose.isValidObjectId(id)
      ? { _id: id, tenantId: req.tenantId }
      : { code: id, tenantId: req.tenantId };
    const patch = { ...fromUI(req.body||{}) };
    if (req.body.vendorId || req.body.vendor) {
      patch.vendorId = req.body.vendorId || await linkVendorId(req.tenantId, req.body.vendor);
    }
    const updated = await Bill.findOneAndUpdate(match, { $set: patch }, { new:true, lean:true });
    if (!updated) return res.status(404).json({ error: "Bill not found" });
    res.json(toUI(updated));
  }catch(e){
    if (dup(e)) return res.status(409).json({ error: "Bill ID already exists" });
    next(e);
  }
});

// DELETE (by _id or code)
router.delete("/:id", async (req,res,next)=>{
  try{
    const { id } = req.params;
    const match = mongoose.isValidObjectId(id)
      ? { _id: id, tenantId: req.tenantId }
      : { code: id, tenantId: req.tenantId };
    const ok = await Bill.findOneAndDelete(match).lean();
    if (!ok) return res.status(404).json({ error: "Bill not found" });
    res.json({ ok: true });
  }catch(e){ next(e); }
});

export default router;
