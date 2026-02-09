import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import { initDatabase } from './db/database.js';
import navigationRoutes from './routes/navigation.js';
import usersRoutes from './routes/users.js';
import historyRoutes from './routes/history.js';
import savedRoutesRoutes from './routes/savedRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROUTE_CACHE_PATH = path.resolve(__dirname, '../route_cache.json');

const maskSecret = (value) => {
  if (!value) return 'missing';
  const str = String(value);
  if (str.length <= 8) return `len=${str.length}`;
  return `${str.slice(0, 6)}...${str.slice(-4)} (len=${str.length})`;
};

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'voice-nav-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

// Initialize database
initDatabase();

// Routes
app.use('/api/users', usersRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/saved-routes', savedRoutesRoutes);
app.use('/api', navigationRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const clearRouteCache = (reason) => {
  try {
    fs.rmSync(ROUTE_CACHE_PATH, { force: true });
    console.log(`Cleared route cache (${reason})`);
  } catch (error) {
    console.error(`Failed to clear route cache (${reason}):`, error);
  }
};

const server = app.listen(PORT, () => {
  console.log('=== Server API Config ===');
  console.log('API base:', `http://localhost:${PORT}/api`);
  console.log('MAPS_ROUTING_API:', process.env.MAPS_ROUTING_API || 'directions');
  console.log('GOOGLE_MAPS_API_KEY:', maskSecret(process.env.GOOGLE_MAPS_API_KEY));
  console.log('GEMINI_API_KEY:', maskSecret(process.env.GEMINI_API_KEY));
  console.log('=== End Server API Config ===');
  console.log(`Server running on http://localhost:${PORT}`);
});

let shuttingDown = false;

const shutdown = (reason, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;

  clearRouteCache(reason);

  server.close(() => {
    process.exit(exitCode);
  });

  // Force exit if close hangs due to open keep-alive connections.
  setTimeout(() => process.exit(exitCode), 5000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('exit', () => clearRouteCache('process exit'));
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown('uncaughtException', 1);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  shutdown('unhandledRejection', 1);
});
