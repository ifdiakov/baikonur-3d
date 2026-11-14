// A cancelled stylesheet request is harmless only when the current document
// demonstrably has that exact stylesheet loaded. Preserve every raw failure.
export function classifyRequestFailures(failures, stylesheets) {
 const loaded = new Set(stylesheets.filter(s => s.loaded && s.rules > 0).map(s => s.href));
 const isLoadedCancellation = request => request.reason === 'net::ERR_ABORTED' &&
  request.resourceType === 'stylesheet' && loaded.has(request.url);
 return {
  cancelledLoadedStylesheets: failures.filter(isLoadedCancellation),
  unexpected: failures.filter(request => !isLoadedCancellation(request))
 };
}
