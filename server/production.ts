import { fileURLToPath } from 'node:url';
import { createProductionApp, createProductionServer, productionConfig } from './productionApp.js';

const config = productionConfig(process.env);
const staticRoot = fileURLToPath(new URL('../dist', import.meta.url));
const { server, stop } = createProductionServer(createProductionApp(config, staticRoot));
server.listen(3002, '127.0.0.1', () => {
  console.log('KindPath staging is listening on 127.0.0.1:3002.');
});

// Drain active requests so a normal stop gives the scanner time to clean up.
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
