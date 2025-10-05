// backend/src/routes/customers.js
import { Router } from "express";
import mongoose from "mongoose";
import Customer from "../models/Customer.js";

const router = Router();

const toUI = (doc = {}) => ({
  _id: String(doc._id || ""),
  id: doc.code || String(doc._id || ""),
  name: doc.name || "",
  email: doc.email || "",
  phone: doc.phone || "",
  address: doc.address || "",
});

const fromUI = (body = {}) => ({
  code: body.id || undefined,
  name: body.name,
  email: body.email,
  phone: body.phone,
  address: body.address,
});

// LIST (optional ?q=)
router.get("/", async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    const filter = { tenantId: req.tenantId };
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
        { code: { $regex: q, $options: "i" } },
      ];
    }
    const docs = await Customer.find(filter).sort({ name: 1 }).limit(500).lean();
    res.json(docs.map(toUI));
  } catch (e) { next(e); }
});

// CREATE
router.post("/", async (req, res, next) => {
  try {
    const payload = { ...fromUI(req.body || {}), tenantId: req.tenantId };
    const doc = await Customer.create(payload);
    res.status(201).json(toUI(doc.toObject()));
  } catch (e) { next(e); }
});

// UPDATE (by _id or code)
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const match = mongoose.isValidObjectId(id)
      ? { _id: id, tenantId: req.tenantId }
      : { code: id, tenantId: req.tenantId };

    const updated = await Customer.findOneAndUpdate(
      match,
      { $set: fromUI(req.body || {}) },
      { new: true, lean: true }
    );
    if (!updated) return res.status(404).json({ error: "Customer not found" });
    res.json(toUI(updated));
  } catch (e) { next(e); }
});

// DELETE (by _id or code)
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const match = mongoose.isValidObjectId(id)
      ? { _id: id, tenantId: req.tenantId }
      : { code: id, tenantId: req.tenantId };

    const ok = await Customer.findOneAndDelete(match).lean();
    if (!ok) return res.status(404).json({ error: "Customer not found" });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
