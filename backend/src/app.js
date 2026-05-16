const cookieParser = require("cookie-parser");
const cors = require("cors");
const express = require("express");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");
const { authenticate } = require("./middleware/auth");
const errorHandler = require("./middleware/errorHandler");

const healthRouter      = require("./routes/health");
const authRouter        = require("./routes/auth");
const timerRouter       = require("./routes/timer");
const usersRouter       = require("./routes/users");
const clientsRouter     = require("./routes/clients");
const projectsRouter    = require("./routes/projects");
const tasksRouter       = require("./routes/tasks");
const reportsRouter     = require("./routes/reports");
const absencesRouter    = require("./routes/absences");
const monthsRouter      = require("./routes/months");
const adminRouter       = require("./routes/admin");
const workEntriesRouter = require("./routes/workEntries");

if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
  console.warn('[WARN] FRONTEND_URL is not set in production — only localhost will be allowed by CORS.');
}

function isExemptFromAuth(req) {
  const path = req.path.replace(/\/+$/, '') || '/';
  if (path === '/api/health') return true;
  if (path.startsWith('/api-docs')) return true;
  if (req.method === 'POST' && path === '/api/auth/login') return true;
  if (req.method === 'POST' && path === '/api/auth/logout') return true;
  return false;
}

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

function corsOriginFn(origin, callback) {
  // No Origin header = server-to-server (e.g. Vercel edge proxy) — allow.
  if (!origin) return callback(null, true);
  if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
  callback(new Error(`CORS: origin '${origin}' not allowed`));
}

function createApp() {
  const app = express();

  app.use(cors({ origin: corsOriginFn, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.use((req, res, next) => {
    if (isExemptFromAuth(req)) return next();
    authenticate(req, res, next);
  });

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/api-docs",        swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.use("/api/health",      healthRouter);
  app.use("/api/auth",        authRouter);
  app.use("/api/timer",       timerRouter);
  app.use("/api/users",       usersRouter);
  app.use("/api/clients",     clientsRouter);
  app.use("/api/projects",    projectsRouter);
  app.use("/api/tasks",       tasksRouter);
  app.use("/api/reports",     reportsRouter);
  app.use("/api/absences",    absencesRouter);
  app.use("/api/months",      monthsRouter);
  app.use("/api/admin",       adminRouter);
  app.use("/api/work-entries", workEntriesRouter);

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
