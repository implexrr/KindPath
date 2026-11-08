// One in-flight scan across fixture and gateway modes in this API process.
let occupied = false;
export function reserveScanner(): (() => void) | undefined {
  if (occupied) return undefined;
  occupied = true;
  return () => { occupied = false; };
}
