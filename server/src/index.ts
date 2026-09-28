import { buildApp } from './api/app.js';
import { config } from './config.js';
import { migrate, pool } from './db.js';
import { seedReferenceData } from './crawler/seed.js';

async function main() {
  await migrate();
  await seedReferenceData();
  const app = await buildApp();
  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(`Kockolov API na ${config.HOST}:${config.PORT} (javni režim: ${config.PUBLIC_MODE ? 'da' : 'ne'})`);
  const stop = async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
