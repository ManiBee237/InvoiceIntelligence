// src/config/db.js
import mongoose from 'mongoose';

export async function connectDB(uri, dbName) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    dbName,                          // if undefined and db is in URI, Mongo uses that
    serverSelectionTimeoutMS: 15000,
    maxPoolSize: 20,
  });
  console.log('[db] connected:', mongoose.connection.name);
  mongoose.connection.on('error', err => console.error('[db] error', err));
}

export function dbState() {
  const s = mongoose.connection.readyState; // 0..3
  return ['disconnected','connected','connecting','disconnecting'][s] || `state-${s}`;
}
