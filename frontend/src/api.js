// src/api.js
import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://localhost:4000',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// usage
export function createProduct(tenantId, payload) {
  return api.post('/api/products', payload, {
    headers: { 'x-tenant-id': tenantId },
  });
}

export function listProducts(tenantId) {
  return api.get('/api/products', {
    headers: { 'x-tenant-id': tenantId },
  });
}
