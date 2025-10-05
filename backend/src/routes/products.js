// backend/src/routes/products.js
import { Router } from "express";
import mongoose from "mongoose";
import Product from "../models/Product.js";

const router = Router();

// Map DB -> UI
const toUI = (doc = {}) => ({
  _id: String(doc._id || ""),
  id: doc.code || String(doc._id || ""),
  name: doc.name || "",
  price: Number(doc.price || 0),
  stock: Number(doc.stock || 0),
  gstPct: Number(doc.gstPct || 0),
  sku: doc.sku || "",
});

// Map UI -> DB
const fromUI = (body = {}) => ({
  code: body.id || undefined,
  name: body.name,
  price: Number(body.price || 0),
  stock: Number(body.stock || 0),
  gstPct: Number(body.gstPct ?? body.gst ?? 0),
  sku: body.sku,
});

// LIST: /api/products?q=...&limit=...
router.get("/", async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    const limit = Math.min(parseInt(req.query.limit || "500", 10), 1000);
    const filter = { tenantId: req.tenantId };
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { code: { $regex: q, $options: "i" } },
        { sku:  { $regex: q, $options: "i" } },
      ];
    }
    const docs = await Product.find(filter).sort({ name: 1 }).limit(limit).lean();
    res.json(docs.map(toUI));
  } catch (e) { next(e); }
});

// CREATE
router.post("/", async (req, res, next) => {
  try {
    const payload = { ...fromUI(req.body || {}), tenantId: req.tenantId };
    const doc = await Product.create(payload);
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
    const updated = await Product.findOneAndUpdate(match, { $set: fromUI(req.body || {}) }, { new: true, lean: true });
    if (!updated) return res.status(404).json({ error: "Product not found" });
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
    const ok = await Product.findOneAndDelete(match).lean();
    if (!ok) return res.status(404).json({ error: "Product not found" });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
