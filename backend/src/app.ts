import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Application, Request, Response, NextFunction } from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/swagger';
import { authenticate } from './middleware/auth';
import errorHandler from './middleware/errorHandler';

import healthRouter      from './routes/health';
import authRouter        from './routes/auth';
import timerRouter       from './routes/timer';
import usersRouter       from './routes/users';
import clientsRouter     from './routes/clients';
import projectsRouter    from './routes/projects';
import tasksRouter       from './routes/tasks';
import reportsRouter     from './routes/reports';
import absencesRouter    from './routes/absences';
import monthsRouter      from './routes/months';
import adminRouter       from './routes/admin';
import workEntriesRouter from './routes/workEntries';

if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
  console.warn('[WARN] FRONTEND_URL is not set in production — only localhost will be allowed by CORS.');
}

function isExemptFromAuth(req: Request): boolean {
  const path = req.path.replace(/\/+$/, '') || '/';
  if (path === '/api/health') return true;
  if (path.startsWith('/api-docs')) return true;
  if (req.method === 'POST' && path === '/api/auth/login') return true;
  if (req.method === 'POST' && path === '/api/auth/logout') return true;
  return false;
}

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'https://time-watch1.netlify.app',
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean) as string[];

function corsOriginFn(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void): void {
  // No Origin header = server-to-server (e.g. Render/Netlify edge) — allow.
  if (!origin) { callback(null, true); return; }
  if (ALLOWED_ORIGINS.includes(origin)) { callback(null, true); return; }
  callback(new Error(`CORS: origin '${origin}' not allowed`));
}

export function createApp(): Application {
  const app = express();

  app.use(cors({
    origin: corsOriginFn,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  app.use(express.json());
  app.use(cookieParser());

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (isExemptFromAuth(req)) return next();
    authenticate(req, res, next);
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api-docs',         swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.use('/api/health',       healthRouter);
  app.use('/api/auth',         authRouter);
  app.use('/api/timer',        timerRouter);
  app.use('/api/users',        usersRouter);
  app.use('/api/clients',      clientsRouter);
  app.use('/api/projects',     projectsRouter);
  app.use('/api/tasks',        tasksRouter);
  app.use('/api/reports',      reportsRouter);
  app.use('/api/absences',     absencesRouter);
  app.use('/api/months',       monthsRouter);
  app.use('/api/admin',        adminRouter);
  app.use('/api/work-entries', workEntriesRouter);

  app.use(errorHandler);

  return app;
}
