// Validate the complete channel shape before a gateway message can trigger DNS.
export function createGatewayApprovalHandler(approve: (host: unknown) => Promise<readonly string[] | null>, onReady: () => void) {
  let ready = false, nextId = 1;
  return async (value: unknown): Promise<unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid gateway message');
    const message = value as Record<string, unknown>;
    if (!ready && Object.keys(message).join(',') === 'ready' && message.ready === true) {
      ready = true; onReady(); return undefined;
    }
    if (!ready || Object.keys(message).sort().join(',') !== 'host,id'
      || message.id !== nextId || nextId > 15 || typeof message.host !== 'string') throw new Error('Invalid gateway approval request');
    nextId++;
    return {id:message.id,addresses:await approve(message.host)};
  };
}
