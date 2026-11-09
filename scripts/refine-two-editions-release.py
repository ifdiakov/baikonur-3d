from pathlib import Path

def edit(file,old,new):
 p=Path(file);s=p.read_text()
 if new in s:return
 if old in s:p.write_text(s.replace(old,new,1))
 else:raise RuntimeError('Source contract changed: '+file+' / '+old[:70])

edit('src/workshop-tools.js',
 "function apply(s,{roads=true}={}){const next=validate(s);for(const [id,p]of baselines)applyObject(id,p);for(const [id,p]of Object.entries(next.objects))applyObject(id,p);if(roads&&next.roads&&enabled)d.roadEditor.replaceState(next.roads);state=next;}",
 "function apply(s,{roads=true}={}){const next=validate(s);const affected=new Set([...Object.keys(state.objects),...Object.keys(next.objects)]);for(const id of affected)applyObject(id,next.objects[id]||baselines.get(id));if(roads&&next.roads&&enabled&&JSON.stringify(next.roads)!==JSON.stringify(d.roadEditor.snapshot()))d.roadEditor.replaceState(next.roads);state=next;}")
edit('src/workshop-tools.js',"select.onchange=sync;sync();","select.onchange=sync;sync();window.addEventListener('workshop-selection',({detail:id})=>{if(known.has(id)){select.value=id;sync();}});")
edit('scripts/prepare-two-editions.py',"(root/'workshop.html').write_text(s)","s=s.replace('currentObject=i;selectSiteCard(i);', \"currentObject=i;if(WORKSHOP_MODE)window.dispatchEvent(new CustomEvent('workshop-selection',{detail:r.id}));selectSiteCard(i);\",1)\n(root/'workshop.html').write_text(s)")
p=Path('src/public-build-export.js');s=p.read_text()
old="function paint(context,rows,x0,z0,scale){context.save();context.setTransform(scale,0,0,scale,-x0*scale,-z0*scale);for(const tri of rows){context.fillStyle=tri.color;context.beginPath();tri.points.forEach(([x,z],i)=>i?context.lineTo(x,z):context.moveTo(x,z));context.closePath();context.fill();}context.restore();}"
new="""function paint(context,rows,x0,z0,scale){context.save();context.setTransform(scale,0,0,scale,-x0*scale,-z0*scale);const groups=new Map();for(const tri of rows){const key=tri.priority+'|'+tri.color;let group=groups.get(key);if(!group){group={path:new Path2D(),color:tri.color,priority:tri.priority};groups.set(key,group);}let [a,b,c]=tri.points;if((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])>0)[b,c]=[c,b];group.path.moveTo(...a);group.path.lineTo(...b);group.path.lineTo(...c);group.path.closePath();}for(const group of [...groups.values()].sort((a,b)=>a.priority-b.priority)){context.fillStyle=group.color;context.fill(group.path,'nonzero');}context.restore();}"""
if old in s:p.write_text(s.replace(old,new,1))
elif new not in s:raise RuntimeError('Raster painter contract changed')
edit('src/public-museum.js','const siteCache=new Map()',"let outerGround=null,abyssGround=null;const outsideColour=new THREE.Color(0x938d78);\nconst siteCache=new Map()")
material="""function terrainMaterial(){const b=manifest.bounds,m=new THREE.MeshBasicMaterial({map:initialTexture,color:0xffffff,alphaTest:.35,side:THREE.FrontSide});m.onBeforeCompile=shader=>{shader.uniforms.publicOutside={value:outsideColour};shader.uniforms.publicBounds={value:new THREE.Vector4(b.minX,b.minZ,b.minX+b.size,b.minZ+b.size)};shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\\nvarying vec2 publicWorldXZ;').replace('#include <begin_vertex>','#include <begin_vertex>\\npublicWorldXZ=transformed.xz;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\\nvarying vec2 publicWorldXZ;uniform vec3 publicOutside;uniform vec4 publicBounds;').replace('#include <map_fragment>','#include <map_fragment>\\nfloat edgeDistance=min(min(publicWorldXZ.x-publicBounds.x,publicBounds.z-publicWorldXZ.x),min(publicWorldXZ.y-publicBounds.y,publicBounds.w-publicWorldXZ.y));diffuseColor.rgb=mix(publicOutside,diffuseColor.rgb,smoothstep(0.0,180.0,edgeDistance));');};m.customProgramCacheKey=()=> 'public-terrain-edge-v1';return m;}
"""
edit('src/public-museum.js','function buildTerrain(){',material+'function buildTerrain(){')
edit('src/public-museum.js',"const mat=new THREE.MeshBasicMaterial({map:initialTexture,color:0xffffff,alphaTest:.35,side:THREE.FrontSide});const mesh=", "const mat=terrainMaterial();const mesh=")
edit('src/public-museum.js',"backdrop.position.y=-700;scene.add(backdrop);","""backdrop.position.y=-700;scene.add(backdrop);abyssGround=backdrop;
 const ring=new THREE.Shape();ring.moveTo(-75000,-75000);ring.lineTo(75000,-75000);ring.lineTo(75000,75000);ring.lineTo(-75000,75000);ring.closePath();const hole=new THREE.Path();hole.moveTo(b.minX,-b.minZ);hole.lineTo(b.minX,-(b.minZ+b.size));hole.lineTo(b.minX+b.size,-(b.minZ+b.size));hole.lineTo(b.minX+b.size,-b.minZ);hole.closePath();ring.holes.push(hole);outerGround=new THREE.Mesh(new THREE.ShapeGeometry(ring),new THREE.MeshBasicMaterial({color:outsideColour.clone(),side:THREE.DoubleSide}));outerGround.rotation.x=-Math.PI/2;outerGround.position.y=-2.755;outerGround.name='Плавное продолжение степи';scene.add(outerGround);""")
edit('src/public-museum.js',"function setNight(value){night=value;", "function setNight(value){night=value;outsideColour.set(0x938d78).multiply(new THREE.Color(value?0x677b85:0xffffff));outerGround?.material.color.copy(outsideColour);abyssGround?.material.color.copy(outsideColour);")
p=Path('src/public-museum.js');s=p.read_text();start=s.index('function labelPositions(');end=s.index('function setQuality(',start)
s=s[:start]+"""function labelPositions(now){if(now-lastLabels<100)return;lastLabels=now;const v=new THREE.Vector3(),occupied=[],important=new Set(['pad-1','pad-31','pad-110','pad-112','pad-250','pad-251','airfield','kpp-7']);const score=s=>s.id===selected?-1e12:important.has(s.id)?-1e10:camera.position.distanceToSquared(new THREE.Vector3(...s.center));const near=[...labels].sort((a,b)=>score(a.s)-score(b.s));let shown=0;
 for(const {s,label}of near){v.fromArray(s.center);v.y+=Math.max(s.size[1]*.6,4);v.project(camera);const width=Math.min(180,Math.ceil(label.textContent.length*(mobile?5.4:6))+16),x=(v.x+1)/2*innerWidth-width/2,y=(1-v.y)/2*innerHeight;const box={x,y,w:width,h:23};const collision=occupied.some(r=>x<r.x+r.w+5&&x+width+5>r.x&&y<r.y+r.h+4&&y+27>r.y);const visible=v.z>-1&&v.z<1&&x>10&&x+width<innerWidth-10&&y>100&&y<innerHeight-55&&shown<(mobile?15:35)&&!collision&&(!s.id.startsWith('sector-')||s.id===selected)&&!(innerWidth>700&&x<300&&y>100);label.hidden=!visible;if(visible){occupied.push(box);shown++;label.style.transform=`translate(${Math.round(x)}px,${Math.round(y)}px)`;}}
}
"""+s[end:];p.write_text(s)
p=Path('src/public-museum.css');s=p.read_text();rule='\n.map-label{max-width:180px;overflow:hidden;text-overflow:ellipsis}\n'
if rule not in s:p.write_text(s+rule)
edit('tests/two-editions-browser.mjs',"const url=base+(edition==='public'", "if(edition==='workshop'&&!throttle)await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>fn.name==='animate'?(window.__WORKSHOP_TEST_FRAME=fn,0):native(fn);});\n const url=base+(edition==='public'")
p=Path('tests/road-editor-style.mjs');s=p.read_text()
if "assert.equal(owner.added.length,19)" in s:
 a=s.index('assert.equal(owner.added.length,19)');b=s.index("assert(!owner.added.some",a)
 s=s[:a]+"""// Owner revision v6 removed Site 105. Never resurrect it for an old fixture.
assert.equal(owner.added.length,18);assert.equal(owner.hidden.length,286);
assert.match(owner.revision,/remove-osm37549252-and-site105/);
assert(!owner.added.some(r=>r.id.startsWith('road-105-')),'Deleted Site 105 access stays deleted');
"""+s[b:];p.write_text(s)
print('EDITION_RELEASE_REFINEMENTS_APPLIED')
