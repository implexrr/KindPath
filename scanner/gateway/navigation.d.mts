export function navigationRejection(requested: unknown, destination: unknown, previous?: unknown): 'DESTINATION_REJECTED'|'REDIRECT_HOST_CHANGED'|'REDIRECT_DOWNGRADE'|undefined;
export function redirectMessage(code: unknown): string|undefined;
