import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPublicWorker } from './scanner/publicDockerWorker.js';
import { mapPublicReport } from './scanner/publicScanner.js';
import { runIsolatedWorker } from './scanner/dockerWorker.js';
import { openLocalDockerSession, ScannerError } from './scanner/dockerWorker.js';
import { PUBLIC_SCANNING_ENABLED } from './scanner/publicPolicy.js';

test('network-disabled browser reaches only the policy gateway through its private socket', async () => {
  assert.equal(PUBLIC_SCANNING_ENABLED,false);
  assert.deepEqual(await runPublicWorker('verify-public-isolation'), {isolation:'passed',forbiddenRequests:10});
});
test('optional example.com smoke scan never enables the public HTTP endpoint', {skip:process.env.KINDPATH_PUBLIC_SMOKE !== '1'}, async () => {
  const raw=await runPublicWorker('https://example.com/');
  const report=mapPublicReport(raw);
  assert.ok(report.scanner?.engineVersion);
  assert.equal(PUBLIC_SCANNING_ENABLED,false);
});

test('gateway scans share admission with fixtures and clean up after cancellation', async () => {
  const abort=new AbortController();
  const run=runPublicWorker('verify-public-isolation',abort.signal);
  await assert.rejects(runIsolatedWorker('clear'), (error: unknown)=>error instanceof ScannerError && error.code==='SCANNER_BUSY');
  const timer=setTimeout(()=>abort.abort(),200);
  try {await assert.rejects(run);} finally {clearTimeout(timer);}
});
test('temporary gateway containers and socket volumes are removed', async () => {
  const session=await openLocalDockerSession();
  try {
    for (const args of [
      ['ps','--all','--quiet','--filter','label=kindpath.scanner=public'],
      ['volume','ls','--quiet','--filter','label=kindpath.scanner=public'],
    ]) assert.equal((await session.command(args)).trim(),'');
  } finally {await session.dispose();}
});
