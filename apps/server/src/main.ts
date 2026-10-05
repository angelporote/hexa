import { buildServer } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';

const config = loadConfig(process.env);
const logger = createLogger(config.logLevel);
const server = await buildServer({ config, logger });

await server.app.listen({ port: config.port, host: '0.0.0.0' });
logger.info({ event: 'listening', port: config.port }, 'servidor escuchando');

const shutdown = (signal: string): void => {
  logger.info({ event: 'shutdown', signal }, 'cerrando');
  server.close().then(
    () => process.exit(0),
    () => process.exit(1),
  );
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
