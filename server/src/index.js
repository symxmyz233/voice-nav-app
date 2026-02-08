import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import navigationRoutes from './routes/navigation.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROUTE_CACHE_PATH = path.resolve(__dirname, '../route_cache.json');

// Middleware
app.use(cors());
app.use(express.json());

// Routes
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
