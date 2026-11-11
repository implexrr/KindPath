import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, readdir, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { scanFixture } from './scanner/fixtureScanner.js';
import { mapSitePreview } from './scanner/sitePreview.js';
import { openLocalDockerSession, removeAndConfirm } from './scanner/dockerWorker.js';
import { assertContainerIsolation, containerArguments, IMAGE, QA_IMAGE } from './scanner/containerPolicy.js';

// Fulfill the app's requests from the built assets and real fixture responses, entirely inside network none.
test('reports, exports and isolated previews work in Chromium, Firefox and WebKit', { timeout: 240000 }, async () => {
  const report = await scanFixture('barriers');
  const sitePreview = mapSitePreview({url:'https://www.example.com/en/start?locale=en',capturedAt:new Date().toISOString(),omittedSubtrees:0,omittedText:0,omittedStyles:0,nodes:[
    {tag:'h1',attributes:{},style:{},hover:{},children:[{text:'Captured website marker'}]},
    {tag:'a',attributes:{},style:{color:'rgb(0, 0, 0)'},hover:{color:'rgb(255, 0, 0)'},children:[{text:'Captured link'}]},
    {tag:'form',attributes:{},style:{},hover:{},children:[{tag:'input',attributes:{},style:{},hover:{},children:[]},
      {tag:'button',attributes:{},style:{},hover:{},children:[{text:'Inactive captured button'}]}]},
    {tag:'aside',attributes:{},style:{},hover:{},children:[{text:'Static captured advertisement'}]},
  ]},{scanId:'11111111-1111-4111-8111-111111111111',requestedUrl:'https://example.com/start',url:'https://www.example.com/en/start?locale=en'});
  const imagePreview=mapSitePreview({kind:'image',url:sitePreview.url,capturedAt:new Date().toISOString(),width:1280,height:1800,truncated:false,
    image:(await readFile(new URL('./fixtures/preview.jpg',import.meta.url))).toString('base64'),links:[{x:100,y:320,width:200,height:30},{x:1100,y:1700,width:100,height:30}]},
    {scanId:sitePreview.scanId,requestedUrl:sitePreview.requestedUrl,url:sitePreview.url});
  const qualityPreviews=Object.fromEntries(Object.entries({empty:[],whitespace:[{text:' \n\t '}],sparse:[{text:'Short page'}],
    text:[{text:'Captured page content. '.repeat(12)}]}).map(([key,nodes])=>[key,mapSitePreview({
      url:sitePreview.url,capturedAt:new Date().toISOString(),omittedSubtrees:0,omittedText:0,omittedStyles:0,nodes,
    },{scanId:sitePreview.scanId,requestedUrl:sitePreview.requestedUrl,url:sitePreview.url})]));
  const textElement=(tag:string,children:unknown[])=>({tag,attributes:{},style:{},hover:{},children});
  qualityPreviews.retained=mapSitePreview({url:sitePreview.url,capturedAt:new Date().toISOString(),omittedSubtrees:0,omittedText:0,omittedStyles:0,
    bodyStyle:{'background-color':'rgb(16, 24, 40)',color:'rgb(248, 250, 252)','font-size':'24px',padding:'24px'},nodes:[
      textElement('div',[textElement('h1',[{text:'Retained visible guide'}]),textElement('p',[{text:'A recognizable controlled page with retained text. '.repeat(4)}]),
        textElement('p',[{text:'Paragraph-before'},{...textElement('span',[{text:'Paragraph-inner'}]),style:{display:'block'}},{text:'Paragraph-after'}]),textElement('b',[{text:'Important text'}]),textElement('i',[{text:'Emphasis'}]),textElement('time',[{text:'10 November'}]),
        textElement('pre',[textElement('code',[{text:'if (water < 2) {\n  water += 1;\n}'}])]),textElement('a',[{text:'Inert retained link'}])])],
    },{scanId:sitePreview.scanId,requestedUrl:sitePreview.requestedUrl,url:sitePreview.url});
  const root = fileURLToPath(new URL('../', import.meta.url));
  const outputRoot=join(root,'logs','browser-checks');await mkdir(outputRoot,{recursive:true});
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
          { env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, timeout: 90000, maxBuffer: 5 * 1024 * 1024 },
          (error, output) => error ? reject(error) : resolve(output));
        child.stdin!.on('error', () => {});
        child.stdin!.end(JSON.stringify({ browser, report, sitePreview, imagePreview, qualityPreviews, assets }));
      });
      const result = JSON.parse(stdout); assert.equal(result.passed, true); assert.equal(result.engine, browser);
      console.info(`${browser} ${result.version}: controlled browser checks passed`);
      if (browser === 'chromium') {
        await writeFile(join(outputRoot, 'kindpath-report-export-public.pdf'), Buffer.from(result.reportPdf, 'base64'));
      }
      for (const size of ['landingDesktop', 'landingMobile', 'findingsDesktop', 'findingsMobile', 'coverageDesktop', 'coverageMobile', 'qualityEmpty', 'qualitySparse']) {
        await writeFile(join(outputRoot, `kindpath-${browser}-static-preview-${size}.png`), Buffer.from(result[size], 'base64'));
      }
    } finally {
      try { await removeAndConfirm(session.command, name); }
      finally { await session.dispose(); await rm(config, { recursive: true, force: true }); }
    }
  }
});
