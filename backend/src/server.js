import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import connectDB from './config/db.js';
import requireTenant from './middleware/requireTenant.js';
import api from './routes/index.js';
import auth from './routes/auth.js'; // <-- add

const app = express();
const ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(morgan('dev'));
app.use(cors({
  origin: ORIGIN,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','x-tenant-id','x-tenant','x-user-id'],
  exposedHeaders: ['x-total-count'],
  credentials: true,
}));
app.options('*', cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

// 🔓 Auth routes (no tenant guard here)
app.use('/api/auth', auth);

// 🔐 Tenant-guarded application routes
app.use('/api', requireTenant, api);

// 404 for API
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Route not found', path: req.path });
  next();
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('⛑️  Error:', { method: req.method, path: req.path, message: err?.message, name: err?.name, code: err?.code });
  if (err?.name === 'CastError') return res.status(400).json({ error: `Invalid ${err.path}`, value: err.value });
  if (err?.code === 11000) return res.status(409).json({ error: 'Duplicate key', key: err.keyValue });
  if (err?.name === 'ValidationError') return res.status(422).json({ error: 'Validation error', details: err.errors });
  const isDev = process.env.NODE_ENV !== 'production';
  return res.status(500).json({ error: 'Server error', message: isDev ? err.message : undefined });
});

await connectDB();
const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => console.log(`API ready at http://localhost:${PORT}`));
