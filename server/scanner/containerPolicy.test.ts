import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertContainerIsolation, isFixture } from './containerPolicy.js';
import { mapFixtureReport } from './fixtureScanner.js';
import { runIsolatedWorker } from './dockerWorker.js';

function isolated() {
  return [{ Config: { User: '1000:1000' }, State: { Running: false }, Mounts: [], HostConfig: {
    NetworkMode: 'none', ReadonlyRootfs: true, Privileged: false, AutoRemove: true,
    IpcMode: 'private', Memory: 536870912, NanoCpus: 1000000000, PidsLimit: 256,
    CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges:true', 'seccomp={"defaultAction":"SCMP_ACT_ERRNO"}'],
    Tmpfs: { '/tmp': 'rw,nosuid,nodev,noexec,size=134217728' },
  } }];
}
test('only built-in fixture identifiers are accepted', async () => {
  assert.equal(isFixture('barriers'), true);
  for (const value of ['https://example.com', 'file:///etc/passwd', '../clear', '/Users', '', null]) {
    assert.equal(isFixture(value), false);
    await assert.rejects(runIsolatedWorker(value as 'barriers'), /Unknown fixture/);
  }
});
test('effective Docker configuration rejects network, mount, and privilege escapes', () => {
  assert.doesNotThrow(() => assertContainerIsolation(isolated()));
  const mutations = [
    (c: any) => { c.HostConfig.NetworkMode = 'bridge'; },
    (c: any) => { c.Mounts = [{ Type: 'bind', Source: '/Users' }]; },
    (c: any) => { c.HostConfig.Binds = ['/Users:/host']; },
    (c: any) => { c.Config.User = '0'; },
    (c: any) => { c.HostConfig.Privileged = true; },
    (c: any) => { c.HostConfig.SecurityOpt = ['seccomp=unconfined']; },
    (c: any) => { c.HostConfig.ReadonlyRootfs = false; },
    (c: any) => { c.HostConfig.CapAdd = ['SYS_ADMIN']; },
    (c: any) => { c.HostConfig.PidMode = 'host'; },
    (c: any) => { c.HostConfig.Memory = 0; },
    (c: any) => { c.HostConfig.SecurityOpt = ['no-new-privileges:true', 'seccomp={"defaultAction":"SCMP_ACT_ALLOW"}']; },
    (c: any) => { c.HostConfig.PortBindings = { '80/tcp': [{}] }; },
    (c: any) => { c.Config.Volumes = { '/host': {} }; },
  ];
  for (const mutate of mutations) {
    const c = isolated(); mutate(c[0]);
    assert.throws(() => assertContainerIsolation(c), /isolation verification failed/);
  }
});
test('reports distinguish confirmed violations from incomplete checks and omit raw HTML', () => {
  const rule = { id: 'label', impact: 'critical', help: 'Label inputs', description: 'Inputs need labels', helpUrl: 'https://dequeuniversity.com/rules/axe/label', nodes: [{ target: ['#email'], summary: 'Add a label', html: '<input>' }] };
  const report = mapFixtureReport({ fixture: 'barriers', engine: 'test', violations: [rule], incomplete: [{ ...rule, id: 'color-contrast' }], passes: 2, inapplicable: 1 }, 'barriers');
  assert.equal(report.mode, 'fixture');
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].severity, 'Critical');
  assert.equal(report.scanner?.incomplete.length, 1);
  assert.ok(!JSON.stringify(report).includes('<input>'));
});
test('malformed or mismatched worker output cannot become a successful report', () => {
  for (const raw of [null, {}, { fixture: 'clear' }, { fixture: 'barriers', engine: 'test', violations: [], incomplete: [], passes: -1, inapplicable: 0 }]) {
    assert.throws(() => mapFixtureReport(raw, 'barriers'), /Invalid scanner output/);
  }
});

test('malformed impact values are rejected in violations and incomplete checks', () => {
  const rule = { id: 'label', impact: 'serious', help: 'Label inputs', description: 'Inputs need labels', helpUrl: 'https://dequeuniversity.com/rules/axe/label', nodes: [] };
  for (const field of ['violations', 'incomplete']) {
    for (const impact of ['constructor', '__proto__', 'toString', 'unexpected', '', null, 42, {}]) {
      const raw = { fixture: 'barriers', engine: 'test', violations: [], incomplete: [], passes: 0, inapplicable: 0, [field]: [{ ...rule, impact }] };
      assert.throws(() => mapFixtureReport(raw, 'barriers'), /Invalid scanner output/);
    }
  }
});
test('supported impact values remain strings after JSON transfer', () => {
  const impacts = ['critical', 'serious', 'moderate', 'minor', 'unknown'];
  const raw = { fixture: 'barriers', engine: 'test', violations: impacts.map(impact => ({ id: impact, impact, help: impact, description: impact, helpUrl: 'https://example.com', nodes: [] })), incomplete: [], passes: 0, inapplicable: 0 };
  const report = JSON.parse(JSON.stringify(mapFixtureReport(raw, 'barriers')));
  assert.deepEqual(report.findings.map((finding: { severity: string }) => finding.severity), ['Critical', 'Serious', 'Moderate', 'Minor', 'Unknown']);
  assert.ok(report.findings.every((finding: { severity: string }) => typeof finding.severity.toLowerCase() === 'string'));
});
