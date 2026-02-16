import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { requestLogger } from './middleware/logger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import routes from './routes';

// Import worker to ensure it's registered
import './jobs/workers/process-sms.worker';

const app: Express = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Body parsing
// IMPORTANT: Twilio sends application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Request logging
app.use(requestLogger);

// Routes
app.use('/', routes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

export default app;
