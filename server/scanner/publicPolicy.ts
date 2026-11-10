import { websiteUrl } from '../../scanner/gateway/url.mjs';
// Local scanning is enabled by default. Tests and troubleshooting can disable it.
function localFlag(name: 'KINDPATH_PUBLIC_SCANNING' | 'KINDPATH_PUBLIC_CAPTURE'): boolean {
  const value=process.env[name];
  if(value===undefined||value==='true')return true;
  if(value==='false')return false;
  throw new Error(`${name} must be true or false.`);
}
export const PUBLIC_SCANNING_ENABLED = localFlag('KINDPATH_PUBLIC_SCANNING');
export const PUBLIC_CAPTURE_ENABLED = localFlag('KINDPATH_PUBLIC_CAPTURE');
export const PUBLIC_LABEL = 'kindpath.scanner=public';

export const validatePublicUrl = (value: unknown): string => websiteUrl(value).href;

export function assertPublicIsolation(value: unknown, role: 'browser' | 'gateway', volume: string, namespace?: string): void {
  const fail = () => { throw new Error('Public worker isolation verification failed.'); };
  if (!Array.isArray(value) || value.length !== 1) return fail();
  const c = value[0]; const h = c?.HostConfig; const mounts = c?.Mounts;
  if (!h || c.State?.Running !== false || c.Config?.User !== '1000:1000'
    || (role === 'gateway' && (!namespace || !/^[a-f0-9]{64}$/.test(namespace)))
    || h.NetworkMode !== (role === 'browser' ? 'none' : `container:${namespace}`)
    || h.Privileged !== false || h.ReadonlyRootfs !== true || h.AutoRemove !== true
    || h.IpcMode !== 'private' || (h.PidMode ?? '') !== '' || h.PublishAllPorts
    || (h.Binds ?? []).length || (h.CapAdd ?? []).length || !h.CapDrop?.includes('ALL')
    || (h.Devices ?? []).length || (h.DeviceRequests ?? []).length || (h.VolumesFrom ?? []).length
    || Object.keys(h.PortBindings ?? {}).length || Object.keys(c.Config?.Volumes ?? {}).length
    || !h.SecurityOpt?.some((s: string) => s === 'no-new-privileges:true' || s === 'no-new-privileges')
    || h.Memory !== (role === 'browser' ? 536870912 : 134217728)
    || h.NanoCpus !== (role === 'browser' ? 1000000000 : 500000000)
    || h.PidsLimit !== (role === 'browser' ? 256 : 64)
    || h.Tmpfs?.['/tmp'] !== 'rw,nosuid,nodev,noexec,size=134217728'
    || !Array.isArray(mounts) || mounts.length !== 1
    || mounts[0].Type !== 'volume' || mounts[0].Name !== volume
    || mounts[0].Destination !== '/run/kindpath' || mounts[0].RW !== (role === 'gateway')) return fail();
  if (role === 'browser') {
    const profile = h.SecurityOpt.find((s: string) => s.startsWith('seccomp='));
    try { if (!profile || JSON.parse(profile.slice(8)).defaultAction !== 'SCMP_ACT_ERRNO') return fail(); } catch { return fail(); }
  }
}
