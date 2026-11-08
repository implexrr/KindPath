export const IMAGE = 'kindpath-fixture-scanner:local';
export const FIXTURES = ['barriers', 'clear'] as const;
export type FixtureId = typeof FIXTURES[number];
export function isFixture(value: unknown): value is FixtureId {
  return typeof value === 'string' && (FIXTURES as readonly string[]).includes(value);
}

export function containerArguments(name: string, profile: string, task: FixtureId | 'verify-isolation' | 'preview-garden'): string[] {
  return [
    'create', '--pull=never', '--rm', '--name', name,
    '--label', 'kindpath.scanner=fixture', '--network=none', '--read-only',
    '--user=1000:1000', '--cap-drop=ALL', '--security-opt=no-new-privileges:true',
    `--security-opt=seccomp=${profile}`, '--memory=512m', '--cpus=1', '--pids-limit=256',
    '--ipc=private', '--shm-size=128m', '--tmpfs=/tmp:rw,nosuid,nodev,noexec,size=134217728',
    '--env=HOME=/tmp/kindpath-home', '--init', IMAGE, task,
  ];
}

// Validate Docker's effective configuration before starting any worker code.
export function assertContainerIsolation(value: unknown): void {
  const fail = () => { throw new Error('Container isolation verification failed.'); };
  if (!Array.isArray(value) || value.length !== 1) return fail();
  const c = value[0];
  const h = c?.HostConfig;
  const profile = h?.SecurityOpt?.find((s: string) => s.startsWith('seccomp='));
  try { if (!profile || JSON.parse(profile.slice('seccomp='.length)).defaultAction !== 'SCMP_ACT_ERRNO') return fail(); } catch { return fail(); }
  if (!h || c.Config?.User !== '1000:1000' || c.State?.Running !== false
    || h.NetworkMode !== 'none' || h.ReadonlyRootfs !== true || h.Privileged !== false
    || h.AutoRemove !== true || h.IpcMode !== 'private' || (h.PidMode ?? '') !== ''
    || h.Memory !== 536870912 || h.NanoCpus !== 1000000000 || h.PidsLimit !== 256
    || h.PublishAllPorts || Object.keys(h.PortBindings ?? {}).length
    || (c.Mounts ?? []).length || (h.Binds ?? []).length || (h.CapAdd ?? []).length
    || (h.Devices ?? []).length || (h.DeviceRequests ?? []).length || (h.VolumesFrom ?? []).length
    || Object.keys(c.Config?.Volumes ?? {}).length
    || !h.CapDrop?.includes('ALL')
    || !h.SecurityOpt?.some((s: string) => s === 'no-new-privileges:true' || s === 'no-new-privileges')
    || !h.SecurityOpt?.some((s: string) => s.startsWith('seccomp=') && s !== 'seccomp=unconfined')
    || h.Tmpfs?.['/tmp'] !== 'rw,nosuid,nodev,noexec,size=134217728') return fail();
}
