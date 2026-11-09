export interface ScanDiagnostic {stage: 'dns'|'network-setup'|'worker-setup'|'worker-execution'|'page-loading'|'accessibility-analysis'|'capture'|'worker-result'|'cleanup';code:string;httpStatus?:number;}
export const DIAGNOSTIC_PREFIX:string;
export function readDiagnostic(value:unknown):ScanDiagnostic|undefined;
export function workerDiagnostic(stderr:unknown):ScanDiagnostic|undefined;
export function classifyFailure(error:unknown,stage:ScanDiagnostic['stage'],signal?:AbortSignal):ScanDiagnostic|undefined;
