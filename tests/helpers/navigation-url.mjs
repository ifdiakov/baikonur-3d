// Resolve real HTTP redirects before a diagnostic route rewrites a document.
// Fulfilling fetched canonical HTML at the old URL would keep the wrong origin
// and block same-origin model requests, WebGL textures and module workers.
export async function resolveNavigationURL(url) {
 const response = await fetch(url, {signal: AbortSignal.timeout(20000)});
 try {
  if (!response.ok) throw Error('Navigation HTTP ' + response.status + ': ' + url);
  return response.url;
 } finally { await response.body?.cancel(); }
}
