// Common entrypoints are integration surfaces, not evidence that every model changed.
// The fast integration workflow covers them; dedicated suites cover their own sources.
export const INTEGRATION_ENTRIES=new Set(['index.html','museum.html','workshop.html']);
export const SHARED_RUNTIME=new Set(['src/archive-kit.js','src/museum-scale.js','src/evening-scene.js','src/steppe-surface.js','src/terrain-relief.js','src/surface-materials.js']);
export function selectDeliveryChecks(name,changes,patterns,match){
 if(name==='verify-osm-release.yml')return {run:false,reason:'Historical 38-browser regression is manual; current integration and feature checks remain automatic.'};
 if(changes.some(c=>c.path==='.github/workflows/'+name))return {run:true,reason:'This verification workflow changed.'};
 if(changes.some(c=>['package.json','package-lock.json'].includes(c.path))&&patterns.some(p=>p==='package.json'||p==='package-lock.json'))return {run:true,reason:'Locked verification dependencies changed.'};
 const meaningful=changes.filter(c=>!INTEGRATION_ENTRIES.has(c.path));
 if(meaningful.some(c=>SHARED_RUNTIME.has(c.path)))return {run:true,reason:'Shared rendering dependency changed.'};
 const scoped=patterns.filter(p=>!INTEGRATION_ENTRIES.has(p));
 return {run:meaningful.some(c=>scoped.some(p=>match(c.path,p))),reason:'Feature sources select feature checks; HTML integration is checked once, separately.'};
}
