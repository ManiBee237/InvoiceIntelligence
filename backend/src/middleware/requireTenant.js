export default function requireTenant(req, res, next) {
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  const tenantId = req.header('x-tenant-id') || req.header('x-tenant');
  if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id' });
  req.tenantId = tenantId;
  next();
}
