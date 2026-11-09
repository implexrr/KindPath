const stages = ['dns','network-setup','worker-setup','worker-execution','page-loading','accessibility-analysis','capture','worker-result','cleanup'];
const networkCodes = ['ERR_FAILED','ERR_BLOCKED_BY_CLIENT','ERR_CONNECTION_TIMED_OUT','ERR_HTTP2_PROTOCOL_ERROR','ERR_TUNNEL_CONNECTION_FAILED','ERR_PROXY_CONNECTION_FAILED','ERR_NAME_NOT_RESOLVED','ERR_CONNECTION_RESET','ERR_CONNECTION_CLOSED','ERR_CONNECTION_REFUSED','ERR_EMPTY_RESPONSE','ERR_ABORTED','ERR_TIMED_OUT','ERR_TOO_MANY_REDIRECTS','ERR_SSL_PROTOCOL_ERROR','ERR_CERT_DATE_INVALID','ERR_CERT_COMMON_NAME_INVALID'];
const codes = ['FAILED','TIMEOUT','CANCELLED','HTTP_STATUS','NO_RESPONSE','TLS_CERTIFICATE_REJECTED','DESTINATION_REJECTED','PAGE_CHANGED_DURING_SCAN','UNCONFIRMED','INVALID_OUTPUT','ENOTFOUND','EAI_AGAIN','ETIMEDOUT','ECONNRESET','ECONNREFUSED',...networkCodes];
export const DIAGNOSTIC_PREFIX = 'KindPath diagnostic: ';

// Whitelist and reconstruct: never return the original object or extra fields.
export function readDiagnostic(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const keys = Object.keys(value).sort().join(',');
  if (!['code,stage','code,httpStatus,stage'].includes(keys) || !stages.includes(value.stage) || !codes.includes(value.code)) return undefined;
  if (value.code === 'HTTP_STATUS') {
    if (value.stage !== 'page-loading' || !Number.isInteger(value.httpStatus) || value.httpStatus < 100 || value.httpStatus > 599) return undefined;
    return {stage:value.stage,code:value.code,httpStatus:value.httpStatus};
  }
  if (keys !== 'code,stage') return undefined;
  return {stage:value.stage,code:value.code};
}

export function workerDiagnostic(stderr) {
  if (typeof stderr !== 'string' || stderr.length > 1024*1024) return undefined;
  const lines = stderr.split(/\r?\n/).filter(line => line.startsWith(DIAGNOSTIC_PREFIX));
  if (lines.length !== 1 || lines[0].length > 512) return undefined;
  try {return readDiagnostic(JSON.parse(lines[0].slice(DIAGNOSTIC_PREFIX.length)));} catch {return undefined;}
}

export function classifyFailure(error, stage, signal) {
  const retained = readDiagnostic(error?.diagnostic) ?? workerDiagnostic(error?.stderr);
  if (retained) return retained;
  let code = 'FAILED';
  if (signal?.aborted) code = signal.reason?.name === 'TimeoutError' ? 'TIMEOUT' : 'CANCELLED';
  else if (error?.name === 'TimeoutError') code = 'TIMEOUT';
  else if (error?.name === 'AbortError') code = 'CANCELLED';
  else if (['ENOTFOUND','EAI_AGAIN','ETIMEDOUT','ECONNRESET','ECONNREFUSED'].includes(error?.code)) code = error.code;
  else if (typeof error?.message === 'string') {
    const token = error.message.match(/^(?:page\.goto:\s*)?net::(ERR_[A-Z0-9_]+)\b/)?.[1];
    if (token === 'ERR_CERT_AUTHORITY_INVALID') code = 'TLS_CERTIFICATE_REJECTED';
    else if (networkCodes.includes(token)) code = token;
  }
  return readDiagnostic({stage,code});
}
