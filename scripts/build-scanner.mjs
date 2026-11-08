import { spawn } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const docker = process.platform === 'darwin' ? '/Applications/Docker.app/Contents/Resources/bin/docker' : '/usr/bin/docker';
const socket = process.platform === 'darwin' ? join(homedir(), '.docker/run/docker.sock') : '/var/run/docker.sock';
const config = await mkdtemp(join(tmpdir(), 'kindpath-build-'));
try {
  if (process.platform === 'darwin') {
    await writeFile(join(config, 'config.json'), JSON.stringify({ cliPluginsExtraDirs: ['/Applications/Docker.app/Contents/Resources/cli-plugins'] }));
  }
  // The build context is scanner/ only; the app, private docs, and home directory are never sent to Docker.
  const child = spawn(docker, ['--config', config, '--host', `unix://${socket}`, 'build', '--tag', 'kindpath-fixture-scanner:local', fileURLToPath(new URL('../scanner/', import.meta.url))], {
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: 'inherit',
  });
  process.exitCode = await new Promise(resolve => {
    child.once('error', () => { console.error('Docker Desktop is unavailable.'); resolve(1); });
    child.once('exit', code => resolve(code ?? 1));
  });
} finally { await rm(config, { recursive: true, force: true }); }
