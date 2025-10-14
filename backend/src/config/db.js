import mongoose from 'mongoose';

export const dbState = { connected: false, uri: null, db: null };

export async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ledgerflow';
  const isAtlas = uri.startsWith('mongodb+srv://');

  const opts = {
    serverSelectionTimeoutMS: 20000,
    retryReads: true,
    retryWrites: true,
    dbName: process.env.MONGODB_DB || undefined,
  };

  try {
    await mongoose.connect(uri, opts);
    const c = mongoose.connection;
    dbState.connected = true;
    dbState.uri = uri;
    dbState.db = c.name;
    console.log(`[mongo] connected → host=${c.host} db=${c.name} srv=${isAtlas}`);
  } catch (err) {
    console.error('[mongo] primary connection failed:', err?.message);
    if (isAtlas) {
      const fallback = 'mongodb://127.0.0.1:27017/ledgerflow';
      try {
        console.log(`[mongo] attempting local fallback → ${fallback}`);
        await mongoose.connect(fallback, { serverSelectionTimeoutMS: 8000 });
        const c = mongoose.connection;
        dbState.connected = true;
        dbState.uri = fallback;
        dbState.db = c.name;
        console.log(`[mongo] fallback connected → host=${c.host} db=${c.name}`);
      } catch (e2) {
        console.error('[mongo] local fallback failed:', e2?.message);
        throw err;
      }
    } else {
      throw err;
    }
  }

  mongoose.connection.on('error', e => {
    dbState.connected = false;
    console.error('[mongo] runtime error:', e?.message);
  });
}

export default connectDB;
