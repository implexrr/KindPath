// Used by the trusted serializer and the iframe's independent outer document guard.
export const PREVIEW_CSP = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export const PREVIEW_GUARD = `<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;

// Image previews allow only embedded raster data; the host accepts JPEG bytes only.
export const IMAGE_PREVIEW_CSP=PREVIEW_CSP.replace("img-src 'none'","img-src data:");
export const IMAGE_PREVIEW_GUARD=`<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${IMAGE_PREVIEW_CSP}">`;
export const MAX_IMAGE_PREVIEW_HTML=2100000;
