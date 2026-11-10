import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProductionApp, productionConfig } from './productionApp.js';

const config = productionConfig(process.env);
const staticRoot = fileURLToPath(new URL('../dist/', import.meta.url));
accessSync(join(staticRoot, 'index.html'), constants.R_OK);
const server = createProductionApp(config, staticRoot).listen(3002, '127.0.0.1', () => {
  console.log('KindPath staging is listening on 127.0.0.1:3002.');
});

// Drain active requests so a normal stop gives the scanner time to clean up.
process.once('SIGTERM', () => server.close());
process.once('SIGINT', () => server.close());
