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
import { mapSitePreview } from './scanner/sitePreview.js';
import { createDemoReport } from './services/analyze.js';
import { openLocalDockerSession, removeAndConfirm } from './scanner/dockerWorker.js';
import { assertContainerIsolation, containerArguments, IMAGE, QA_IMAGE } from './scanner/containerPolicy.js';

// Fulfill the app's requests from the built assets and real fixture responses, entirely inside network none.
test('reports, exports and isolated previews work in Chromium, Firefox and WebKit', { timeout: 180000 }, async () => {
  const snapshot = await captureFixturePreview();
  const barriersSnapshot = await captureFixturePreview('barriers');
  const clearSnapshot = await captureFixturePreview('clear');
  const report = await scanFixture('barriers');
  const clearReport = await scanFixture('clear');
  const demoReport = createDemoReport(new URL('https://example.com'));
  const sitePreview = mapSitePreview({url:'https://www.example.com/start',capturedAt:new Date().toISOString(),omittedSubtrees:0,omittedText:0,omittedStyles:0,nodes:[
    {tag:'h1',attributes:{},style:{},hover:{},children:[{text:'Captured website marker'}]},
    {tag:'a',attributes:{},style:{color:'rgb(0, 0, 0)'},hover:{color:'rgb(255, 0, 0)'},children:[{text:'Captured link'}]},
    {tag:'form',attributes:{},style:{},hover:{},children:[{tag:'input',attributes:{},style:{},hover:{},children:[]},
      {tag:'button',attributes:{},style:{},hover:{},children:[{text:'Inactive captured button'}]}]},
    {tag:'aside',attributes:{},style:{},hover:{},children:[{text:'Static captured advertisement'}]},
  ]},{scanId:'11111111-1111-4111-8111-111111111111',requestedUrl:'https://example.com/start',url:'https://www.example.com/start'});
  const qualityPreviews=Object.fromEntries(Object.entries({empty:[],whitespace:[{text:' \n\t '}],sparse:[{text:'Short page'}],
    text:[{text:'Captured page content. '.repeat(12)}]}).map(([key,nodes])=>[key,mapSitePreview({
      url:sitePreview.url,capturedAt:new Date().toISOString(),omittedSubtrees:0,omittedText:0,omittedStyles:0,nodes,
    },{scanId:sitePreview.scanId,requestedUrl:sitePreview.requestedUrl,url:sitePreview.url})]));
  const textElement=(tag:string,children:unknown[])=>({tag,attributes:{},style:{},hover:{},children});
  qualityPreviews.retained=mapSitePreview({url:sitePreview.url,capturedAt:new Date().toISOString(),omittedSubtrees:0,omittedText:0,omittedStyles:0,
    bodyStyle:{'background-color':'rgb(16, 24, 40)',color:'rgb(248, 250, 252)','font-size':'24px',padding:'24px'},nodes:[
      textElement('div',[textElement('h1',[{text:'Retained visible guide'}]),textElement('p',[{text:'A recognizable controlled page with retained text. '.repeat(4)}]),
        textElement('b',[{text:'Important text'}]),textElement('i',[{text:'Emphasis'}]),textElement('time',[{text:'10 November'}]),
        textElement('pre',[textElement('code',[{text:'if (water < 2) {\n  water += 1;\n}'}])]),textElement('a',[{text:'Inert retained link'}])])],
    },{scanId:sitePreview.scanId,requestedUrl:sitePreview.requestedUrl,url:sitePreview.url});
  const root = fileURLToPath(new URL('../', import.meta.url));
  const assets: Record<string, { body: string; type: string }> = {
    '/': { body: await readFile(join(root, 'dist/index.html'), 'utf8'), type: 'text/html' },
  };
  for (const name of await readdir(join(root, 'dist/assets'))) {
    if (!/\.(js|css)$/.test(name)) continue;
    assets[`/assets/${name}`] = { body: await readFile(join(root, 'dist/assets', name), 'utf8'), type: name.endsWith('.js') ? 'text/javascript' : 'text/css' };
  }
  const script = await readFile(join(root, 'scripts/preview-browser.mjs'), 'utf8');
  for (const browser of ['chromium', 'firefox', 'webkit']) {
    const session = await openLocalDockerSession();
    const config = await mkdtemp(join(tmpdir(), 'kindpath-preview-ui-'));
    const name = `kindpath-preview-ui-${browser}-${randomUUID()}`;
    try {
      const args = containerArguments(name, join(root, 'scanner/seccomp.json'), 'verify-isolation');
      args[args.indexOf('--label') + 1] = 'kindpath.preview=qa';
      args.splice(1, 0, '--interactive');
      args.splice(args.indexOf(IMAGE), 0, '--entrypoint=node');
      args[args.indexOf(IMAGE)] = QA_IMAGE; // UI engines never select the scanner runtime image.
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
        child.stdin!.end(JSON.stringify({ browser, snapshot, barriersSnapshot, clearSnapshot, report, clearReport, demoReport, sitePreview, qualityPreviews, assets }));
      });
      const result = JSON.parse(stdout); assert.equal(result.passed, true); assert.equal(result.engine, browser);
      console.info(`${browser} ${result.version}: controlled browser checks passed`);
      for (const kind of browser === 'chromium' ? ['fixture', 'demo'] : []) {
        await writeFile(join(tmpdir(), `kindpath-report-export-${kind}.pdf`), Buffer.from(result[`${kind}Pdf`], 'base64'));
      }
      for (const size of ['desktop', 'mobile', 'findingsDesktop', 'findingsMobile', 'matchingDesktop', 'matchingMobile', 'coverageDesktop', 'coverageMobile', 'qualityEmpty', 'qualitySparse']) {
        await writeFile(join(tmpdir(), `kindpath-${browser}-static-preview-${size}.png`), Buffer.from(result[size], 'base64'));
      }
    } finally {
      try { await removeAndConfirm(session.command, name); }
      finally { await session.dispose(); await rm(config, { recursive: true, force: true }); }
    }
  }
});
