import {classifyFailure} from '../../scanner/gateway/diagnostics.mjs';
import type {ScanDiagnostic} from '../../scanner/gateway/diagnostics.mjs';
import {ScannerError} from './dockerWorker.js';

export async function atScanStage<T>(stage: ScanDiagnostic['stage'], run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  try {return await run();}
  catch(error) {
    if (error instanceof ScannerError && error.diagnostic) throw error;
    throw new ScannerError(error instanceof ScannerError ? error.code : 'SCAN_FAILED',
      error instanceof ScannerError ? error.message : 'The isolated scan failed. No report was produced.',
      classifyFailure(error,stage,signal));
  }
}
