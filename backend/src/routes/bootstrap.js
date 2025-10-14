import { Router } from 'express';
import Tenant from '../models/Tenant.js';
import Customer from '../models/Customer.js';
import Invoice from '../models/Invoice.js';

const r = Router();

// GET /api/bootstrap  (needs x-tenant-id)
r.get('/', async (req, res) => {
  const tenantId = req.header('x-tenant-id') || req.header('x-tenant');
  if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id' });

  const tenant = await Tenant.findOne({ slug: tenantId }).lean();
  if (!tenant) return res.status(404).json({ error: 'Tenant not found', tenantId });

  const [customerCount, invoiceCount, paidAgg, allAgg, customersSample, invoicesSample] =
    await Promise.all([
      Customer.countDocuments({ tenantId }),
      Invoice.countDocuments({ tenantId }),
      Invoice.aggregate([
        { $match: { tenantId, status: 'paid' } },
        { $group: { _id: null, totalPaid: { $sum: '$total' } } },
        { $project: { _id: 0, totalPaid: 1 } }
      ]),
      Invoice.aggregate([
        { $match: { tenantId } },
        { $group: { _id: null, totalAll: { $sum: '$total' } } },
        { $project: { _id: 0, totalAll: 1 } }
      ]),
      Customer.find({ tenantId }).sort({ createdAt: -1 }).limit(5).lean(),
      Invoice.find({ tenantId }).populate({ path: 'customerId', select: 'name email phone' })
             .sort({ createdAt: -1 }).limit(5).lean(),
    ]);

  const totalInvoiced = allAgg?.[0]?.totalAll || 0;
  const totalPaid = paidAgg?.[0]?.totalPaid || 0;
  const totalOutstanding = Math.max(0, totalInvoiced - totalPaid);

  res.json({
    tenant: {
      id: tenant._id,
      slug: tenant.slug,
      name: tenant.name,
      email: tenant.email || null,
      phone: tenant.phone || null,
      currency: tenant.currency || 'INR',
      timezone: tenant.timezone || 'Asia/Kolkata',
      logoUrl: tenant.logoUrl || null,
      theme: tenant.theme || { primary: '#134686', accent: '#FEB21A' },
      settings: tenant.settings || {}
    },
    stats: {
      customers: customerCount,
      invoices: invoiceCount,
      totalInvoiced,
      totalOutstanding,
      totalPaid
    },
    samples: {
      customers: customersSample,
      invoices: invoicesSample
    }
  });
});

export default r;
