// backend/src/utils/mappers.js

// Compute total from line items (server-side safety)
function computeItemsTotal(items = []) {
  return Math.round(
    items.reduce((sum, it) => {
      const up = Number(it.unitPrice || 0);
      const qty = Number(it.qty || 0);
      const gst = Number(it.gstPct || 0);
      return sum + up * qty * (1 + gst / 100);
    }, 0)
  );
}

/**
 * Convert DB Invoice doc -> UI shape your table/form expects.
 * Ensures qty/unitPrice/gst fields exist (front-end uses them directly).
 */
export function invoiceToUI(doc = {}) {
  const items = doc.items || [];
  const first = items[0] || {};
  const unitPrice = Number(first.unitPrice ?? doc.unitPrice ?? 0);
  const qty = Number(first.qty ?? doc.qty ?? 1);
  const gst = Number(first.gstPct ?? doc.gst ?? 0);

  const total =
    typeof doc.total === "number" ? doc.total : computeItemsTotal(items);

  return {
    _id: String(doc._id || doc.id || ""),
    number: doc.number,
    customerId: doc.customerId,
    customerName: doc.customerName,
    date: doc.date,
    dueDate: doc.dueDate,
    status: doc.status,
    qty,
    unitPrice,
    gst,
    total,
  };
}

/**
 * Convert UI payload -> DB Invoice shape.
 * Accepts single-line convenience fields or full items[].
 */
export function invoiceFromUI(body = {}) {
  const hasItems =
    Array.isArray(body.items) && body.items.length && body.items[0]?.name;

  const items = hasItems
    ? body.items.map((it) => ({
        name: it.name ?? "Service",
        qty: Number(it.qty ?? 1),
        unitPrice: Number(it.unitPrice ?? 0),
        gstPct: Number(it.gstPct ?? it.gst ?? 0),
      }))
    : [
        {
          name: body.itemName ?? "Service",
          qty: Number(body.qty ?? 1),
          unitPrice: Number(body.unitPrice ?? 0),
          gstPct: Number(body.gst ?? 0),
        },
      ];

  const total =
    typeof body.total === "number" ? body.total : computeItemsTotal(items);

  return {
    number: body.number,
    customerId: body.customerId || null,
    customerName: body.customerName || "",
    date: body.date || new Date(),
    dueDate: body.dueDate || null,
    status: body.status || "Open",
    items,
    total,
  };
}
