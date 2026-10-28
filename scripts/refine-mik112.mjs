import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>readFileSync(p,'utf8'),write=(p,s)=>writeFileSync(p,s);
let model=read('src/mik112.js');
const marker='// Add a modest feeder to the actual museum railway';
const idx=model.indexOf(marker);
if(idx>=0)model=model.slice(0,idx)+"// Verified clean western rail connection.\nexport {connectMik112Rails} from './mik112-rail.js?v=clean-west-v2';\n";
model=model.replace("version:'1.0-photo-112'","version:'1.1-clean-feeder'");
if(!model.includes('mik-floor-finish')){
 const a="box(188,.6,240,0,floor-.3,0,'concrete','hall-floor');";
 assert.ok(model.includes(a));
 model=model.replace(a,a+"\n // The finished slab occludes schematic map paint beneath the real hall.\n box(188,.9,240,0,floor+.45,0,'concrete','mik-floor-finish');");
}
assert.ok(model.includes('mik112-rail.js'));write('src/mik112.js',model);
let h=read('index.html');
h=h.replace('mik112.js?v=112-photo-v1\'','mik112.js?v=112-photo-v1.1-floor2\'');
h=h.replace('mik112.js?v=112-photo-v1.1\'','mik112.js?v=112-photo-v1.1-floor2\'');
if(!h.includes('MIK112_PLACEHOLDER_OCCLUSION')){
 const a=' mik112Rail=connectMik112Rails(group,{data:transportData,point,parent:layers.rails});';
 assert.ok(h.includes(a));
 h=h.replace(a,a+`
 // MIK112_PLACEHOLDER_OCCLUSION: hide only the overlapping generic 2B cubes.
 // Its record, coordinates and information card remain in the museum.
 const placeholder=objects.find(o=>o.record.id==='pad-2b');
 if(placeholder){
  const fallback=placeholder.g.children.slice();fallback.forEach(o=>o.visible=false);
  const originalYear=mik112Exhibit.setYear;
  mik112Exhibit.setYear=y=>{originalYear(y);fallback.forEach(o=>o.visible=y<1967);};
  group.userData.mik112Model.suppressedFallbackGeometry=['pad-2b'];
 }
`);
}
write('index.html',h);
let test=read('tests/mik112-browser.mjs');
test=test.replaceAll("'1.0-photo-112'","'1.1-clean-feeder'").replaceAll("'mik112-photo-v1'","'mik112-photo-v1.1'");
if(!test.includes('western trunk, not phantom')){
 const a='assert.ok(s.mik112Rail.connected);assert.equal(s.mik112Rail.tracks.length,4);';
 assert.ok(test.includes(a));test=test.replace(a,a+"\n assert.equal(s.mik112Rail.sourceRoute,'t-central-north','western trunk, not phantom feeder');\n assert.deepEqual(s.mik112.suppressedFallbackGeometry,['pad-2b']);");
 test=test.replace("await page.screenshot({path:`qa-mik112/${prefix}-grasshoppers.png`});","await page.screenshot({path:`qa-mik112/${prefix}-grasshoppers.png`});\n await page.locator('#showLabels').uncheck();\n await page.screenshot({path:`qa-mik112/${prefix}-grasshoppers-clear.png`});");
 test=test.replace("await page.screenshot({path:`qa-mik112/${prefix}-plan.png`});","await page.screenshot({path:`qa-mik112/${prefix}-plan.png`});\n await page.locator('#showLabels').check();");
}
if(!test.includes("features['mik-floor-finish']")){
 test=test.replace("assert.ok(s.mik112.features['retained-light-roof']>=1);","assert.ok(s.mik112.features['retained-light-roof']>=1);\n assert.equal(s.mik112.features['mik-floor-finish'],1);");
}
write('tests/mik112-browser.mjs',test);
write('/tmp/mik112-check/main.mjs',h.match(/<script type="module">([\s\S]*?)<\/script>/)[1]);
// Apply the user's scale/end/plan correction after the compatible v1.1 fixes.
await import('./relocate-mik112.mjs');
