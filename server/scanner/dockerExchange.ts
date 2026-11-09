import { spawn } from 'node:child_process';

export type Exchange = (args: string[], handle: (message: unknown) => Promise<unknown>, signal: AbortSignal) => Promise<void>;

// The only input to this channel is bounded JSON from an owned gateway. Never
// interpret its messages as command arguments, paths, or firewall rule text.
export async function exchangeDockerJson(docker: string, args: string[], handle: (message: unknown) => Promise<unknown>, signal: AbortSignal) {
  signal.throwIfAborted();
  const child = spawn(docker, args, { env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, signal, timeout: 65_000, stdio: ['pipe','pipe','pipe'] });
  child.stdin.on('error', () => {});
  let diagnostics = 0;
  child.stderr.on('data', chunk => { diagnostics += chunk.length; if (diagnostics > 4096) child.kill(); });
  const exited = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error('Gateway channel closed')));
  });
  const consume = (async () => {
    let buffer = '', total = 0;
    for await (const chunk of child.stdout) {
      total += chunk.length;
      if (total > 32768) throw new Error('Gateway channel limit exceeded');
      buffer += chunk.toString('utf8');
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        if (newline > 8192) throw new Error('Gateway message limit exceeded');
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        signal.throwIfAborted();
        const reply = await handle(JSON.parse(line));
        signal.throwIfAborted();
        if (reply !== undefined) {
          const encoded = JSON.stringify(reply) + '\n';
          if (Buffer.byteLength(encoded) > 8192) throw new Error('Gateway response limit exceeded');
          child.stdin.write(encoded);
        }
      }
      if (buffer.length > 8192) throw new Error('Gateway message limit exceeded');
    }
    if (buffer) throw new Error('Incomplete gateway message');
  })();
  try { await Promise.all([consume, exited]); }
  finally {
    child.kill();
    // An approval may be completing a shielded Docker create. Settle it before
    // the caller can begin resource cleanup, including on cancellation.
    await Promise.allSettled([consume, exited]);
  }
}
