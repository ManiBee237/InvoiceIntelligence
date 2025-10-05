// backend/src/routes/vendors.js
import { Router } from "express";
import mongoose from "mongoose";
import Vendor from "../models/Vendor.js";

const router = Router();
const dup = (e) => e && e.code === 11000;

const toUI = (doc={}) => ({
  _id: String(doc._id || ""),
  id: doc.code || String(doc._id || ""),
  name: doc.name || "",
  email: doc.email || "",
  phone: doc.phone || "",
  address: doc.address || "",
  gstin: doc.gstin || "",
});
const fromUI = (b={}) => ({
  code: b.id || undefined,
  name: b.name,
  email: b.email,
  phone: b.phone,
  address: b.address,
  gstin: b.gstin,
});

// LIST ?q=
router.get("/", async (req,res,next)=>{
  try{
    const q = (req.query.q || "").trim();
    const filter = { tenantId: req.tenantId };
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { code: { $regex: q, $options: "i" } },
        { gstin:{ $regex: q, $options: "i" } },
      ];
    }
    const docs = await Vendor.find(filter).sort({ name: 1 }).limit(500).lean();
    res.json(docs.map(toUI));
  }catch(e){ next(e); }
});

// CREATE
router.post("/", async (req,res,next)=>{
  try{
    const doc = await Vendor.create({ ...fromUI(req.body||{}), tenantId: req.tenantId });
    res.status(201).json(toUI(doc.toObject()));
  }catch(e){
    if (dup(e)) return res.status(409).json({ error: "Vendor ID already exists" });
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
    const updated = await Vendor.findOneAndUpdate(match, { $set: fromUI(req.body||{}) }, { new:true, lean:true });
    if (!updated) return res.status(404).json({ error: "Vendor not found" });
    res.json(toUI(updated));
  }catch(e){
    if (dup(e)) return res.status(409).json({ error: "Vendor ID already exists" });
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
    const ok = await Vendor.findOneAndDelete(match).lean();
    if (!ok) return res.status(404).json({ error: "Vendor not found" });
    res.json({ ok: true });
  }catch(e){ next(e); }
});

export default router;
