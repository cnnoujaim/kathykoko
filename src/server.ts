import app from './app';
import { config, validateConfig } from './config';
import { pool } from './config/database';
import { redis } from './config/redis';

async function startServer() {
  try {
    // Validate environment variables
    validateConfig();

    // Test database connection
    await pool.query('SELECT 1');
    console.log('✓ Database connected');

    // Test Redis connection
    await redis.ping();
    console.log('✓ Redis connected');

    // Start server
    const port = config.port;
    app.listen(port, () => {
      console.log('');
      console.log('🚀 Kathy Koko is live!');
      console.log(`📍 Server running on port ${port}`);
      console.log(`🌍 Environment: ${config.nodeEnv}`);
      console.log('');
      console.log('Endpoints:');
      console.log(`  GET  /health`);
      console.log(`  GET  /health/integrations`);
      console.log(`  POST /webhooks/sms/incoming`);
      console.log(`  POST /webhooks/sms/status`);
      console.log('');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
