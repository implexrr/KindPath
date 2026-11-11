import { spawnSync } from 'node:child_process';
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

await mkdir('build', { recursive: true });
if (!(await lstat('build')).isDirectory()) throw new Error('The build directory must be a real project directory.');
const release = await mkdtemp(join('build', 'production-'));

try {
  for (const [command, args] of [
    ['vite', ['build', '--outDir', join(release, 'dist')]],
    ['tsc', ['-p', 'tsconfig.production.json', '--outDir', release]],
  ]) {
    const result = spawnSync(command, args, { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Could not build the production release with ${command}.`);
  }

  for (const file of [
    'package-lock.json',
    'scanner/gateway/diagnostics.mjs',
    'scanner/gateway/navigation.mjs',
    'scanner/gateway/url.mjs',
    'scanner/jpeg.mjs',
    'scanner/seccomp.json',
  ]) {
    if (await realpath(file) !== resolve(file) || !(await lstat(file)).isFile()) {
      throw new Error(`Production input must be a regular project file: ${file}`);
    }
    const target = join(release, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(file, target);
  }

  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
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
