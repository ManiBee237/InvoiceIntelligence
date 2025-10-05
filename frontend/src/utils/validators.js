// src/utils/validators.js
export const required = (v) => (v == null || String(v).trim() === '' ? 'Required' : '')
export const numberMin = (min) => (v) => (isNaN(v) || Number(v) < min ? `Min ${min}` : '')
export const dateISO = (v) => (Number.isNaN(Date.parse(v)) ? 'Invalid date' : '')

export function validateInvoice(values) {
  const errors = {}
  if (required(values.number)) errors.number = 'Invoice number is required'
  if (required(values.customerName)) errors.customerName = 'Customer is required'
  if (required(values.total) || numberMin(1)(values.total)) errors.total = 'Amount must be ≥ 1'
  if (required(values.date) || dateISO(values.date)) errors.date = 'Provide a valid issue date'
  if (required(values.dueDate) || dateISO(values.dueDate)) errors.dueDate = 'Provide a valid due date'
  return errors
}
