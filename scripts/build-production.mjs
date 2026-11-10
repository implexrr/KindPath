import { spawnSync } from 'node:child_process';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const manifest = JSON.parse(await readFile('package.json', 'utf8'));
await mkdir('build', { recursive: true });
const release = await mkdtemp(join('build', 'production-'));

try {
  const compiler = spawnSync('tsc', ['-p', 'tsconfig.production.json', '--outDir', release], { stdio: 'inherit' });
  if (compiler.error) throw compiler.error;
  if (compiler.status !== 0) throw new Error('Could not compile the production server.');

  for (const file of [
    'dist/index.html',
    'dist/assets',
    'package-lock.json',
    'scanner/gateway/diagnostics.mjs',
    'scanner/gateway/navigation.mjs',
    'scanner/gateway/url.mjs',
    'scanner/jpeg.mjs',
    'scanner/seccomp.json',
  ]) {
    const target = join(release, file);
    await mkdir(dirname(target), { recursive: true });
    if (file === 'dist/assets') await cp(file, target, { recursive: true });
    else await copyFile(file, target);
  }

  await writeFile(join(release, 'package.json'), JSON.stringify({
    name: manifest.name,
    version: manifest.version,
    private: true,
    type: manifest.type,
    engines: manifest.engines,
    dependencies: manifest.dependencies,
    scripts: { start: 'node server/production.js' },
  }, null, 2) + '\n');
} catch (error) {
  await rm(release, { recursive: true, force: true });
  throw error;
}
console.log(`Production release: ${release}`);
