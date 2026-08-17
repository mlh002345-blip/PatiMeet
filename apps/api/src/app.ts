import cors from 'cors';
import express from 'express';
import { config } from './config';
import { migrate } from './db';
import { errorHandler } from './http';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { discoverRouter } from './routes/discover';
import { dogsRouter } from './routes/dogs';
import { eventsRouter } from './routes/events';
import { legalRouter } from './routes/legal';
import { messagesRouter } from './routes/messages';
import { safetyRouter } from './routes/safety';
import { usersRouter } from './routes/users';

export function createApp(): express.Express {
  migrate();

  const app = express();
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'patimeet-api', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/dogs', dogsRouter);
  app.use('/api/discover', discoverRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/messages', messagesRouter);
  app.use('/api/safety', safetyRouter);
  app.use('/api/legal', legalRouter);
  app.use('/api/admin', adminRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Uç bulunamadı.' } });
  });

  app.use(errorHandler);
  return app;
}
