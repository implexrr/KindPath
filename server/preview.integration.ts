import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, readdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { captureFixturePreview } from './scanner/fixturePreview.js';
import { scanFixture } from './scanner/fixtureScanner.js';
import { openLocalDockerSession, removeAndConfirm } from './scanner/dockerWorker.js';
import { assertContainerIsolation, containerArguments, IMAGE } from './scanner/containerPolicy.js';

// Fulfill the app's requests from the built assets and real fixture responses, entirely inside network none.
test('fixture preview supports isolated snapshots, composable vision controls, keyboard interaction, and mobile layout', { timeout: 90000 }, async () => {
  const snapshot = await captureFixturePreview();
  const report = await scanFixture('barriers');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const assets: Record<string, { body: string; type: string }> = {
    '/': { body: await readFile(join(root, 'dist/index.html'), 'utf8'), type: 'text/html' },
  };
  for (const name of await readdir(join(root, 'dist/assets'))) {
    if (!/\.(js|css)$/.test(name)) continue;
    assets[`/assets/${name}`] = { body: await readFile(join(root, 'dist/assets', name), 'utf8'), type: name.endsWith('.js') ? 'text/javascript' : 'text/css' };
  }
  const script = await readFile(join(root, 'scripts/preview-browser.mjs'), 'utf8');
  const session = await openLocalDockerSession();
  const config = await mkdtemp(join(tmpdir(), 'kindpath-preview-ui-'));
  const name = `kindpath-preview-ui-${randomUUID()}`;
  try {
    const args = containerArguments(name, join(root, 'scanner/seccomp.json'), 'verify-isolation');
    args[args.indexOf('--label') + 1] = 'kindpath.preview=qa';
    args.splice(1, 0, '--interactive');
    args.splice(args.indexOf(IMAGE), 0, '--entrypoint=node');
    args.splice(args.length - 1, 1, '--input-type=module', '-e', script);
    await session.command(args);
    assertContainerIsolation(JSON.parse(await session.command(['inspect', name])));
    const docker = process.platform === 'darwin' ? '/Applications/Docker.app/Contents/Resources/bin/docker' : '/usr/bin/docker';
    const socket = process.platform === 'darwin' ? join(homedir(), '.docker/run/docker.sock') : '/var/run/docker.sock';
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = execFile(docker, ['--config', config, '--host', `unix://${socket}`, 'start', '--attach', '--interactive', name],
        { env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, timeout: 60000, maxBuffer: 5 * 1024 * 1024 },
        (error, output) => error ? reject(error) : resolve(output));
      child.stdin!.on('error', () => {});
      child.stdin!.end(JSON.stringify({ snapshot, report, assets }));
    });
    const result = JSON.parse(stdout); assert.equal(result.passed, true);
    for (const size of ['desktop', 'mobile']) {
      await writeFile(join(tmpdir(), `kindpath-static-preview-${size}.png`), Buffer.from(result[size], 'base64'));
    }
  } finally {
    try { await removeAndConfirm(session.command, name); }
    finally { await session.dispose(); await rm(config, { recursive: true, force: true }); }
  }
});
