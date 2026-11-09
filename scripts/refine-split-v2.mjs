import {readFile,writeFile} from 'node:fs/promises';
async function edit(file,changes){let s=await readFile(file,'utf8');for(const [a,b]of changes){if(s.includes(b))continue;if(!s.includes(a))throw Error('Expected source not found: '+file+' / '+a.slice(0,80));s=s.replace(a,b);}await writeFile(file,s);}
await edit('scripts/build-public-scene.mjs',[
 ["3,Math.max(180,Math.floor(indices.length*.08/3)*3),.025);}catch{}", "3,null,Math.max(90,Math.floor(indices.length*.035/3)*3),.045);}catch(error){throw Error('Overview simplification failed: '+id+' '+error.message);}"],
 ["let simple=geo.clone();simple.deleteAttribute('uv');simple.deleteAttribute('normal');simple.deleteAttribute('color');simple=mergeVertices(simple,.002);", "let simple=new THREE.BufferGeometry();const coords=new Float32Array(source.count*3);for(let i=0;i<source.count;i++){coords[i*3]=source.getX(i);coords[i*3+1]=source.getY(i);coords[i*3+2]=source.getZ(i);}simple.setAttribute('position',new THREE.BufferAttribute(coords,3));if(geo.index)simple.setIndex(geo.index.clone());simple=mergeVertices(simple,.002);"],
 ["if(extent*Math.max(scale.x,scale.y,scale.z)<.7)continue;", "const dims=geo.boundingBox.getSize(new THREE.Vector3()).multiply(scale),edges=[dims.x,dims.y,dims.z].sort((a,b)=>a-b);if(edges[2]<1.2||(edges[1]<.32&&edges[2]<9))continue;"],
 ["steppeSurface,roadLOD};window.__BAIKONUR_QA", "steppeSurface,roadLOD,riverSurface};window.__BAIKONUR_QA"],
 ["if(!m.isMesh||m.isSkinnedMesh)return;\n    const cleanMat", "if(!m.isMesh||m.isSkinnedMesh)return;\n    const component=m.userData.museumComponent||'';\n    if(component==='murguduk-hill'||component==='internal-access-road'||component==='service-lane'||/asphalt/i.test(m.material?.name||''))return;\n    const cleanMat"],
 ["copy.matrix.copy(m.matrixWorld);copy.matrixAutoUpdate=false;root.add(copy);", "copy.name=m.name;copy.userData={museumComponent:m.userData.museumComponent||''};copy.matrix.copy(m.matrixWorld);copy.matrixAutoUpdate=false;root.add(copy);"],
 ["const allow=o=>o?.traverse(m=>{if(m.isMesh||m.isLine||m.isPoints)allowed.add(m);});", "const allow=o=>o?.traverseVisible(m=>{if(m.isMesh||m.isLine||m.isPoints)allowed.add(m);});\n  for(const layer of [b.layers.roads,b.layers.rails])for(const root of layer.children)if(root.name.startsWith('OpenStreetMap ·'))root.visible=true;"],
 ["b.sharedSiloHill.mesh,b.layers.roads,b.layers.rails])allow(g);", "b.sharedSiloHill.mesh,b.layers.roads,b.layers.rails,b.riverSurface.group])allow(g);\n  for(const o of b.objects)o.g.traverseVisible(m=>{const c=m.userData.museumComponent||'';if(m.isMesh&&(c==='internal-access-road'||c==='service-lane'||/asphalt/i.test(m.material?.name||'')))allowed.add(m);});"],
 ["if(o.isMesh||o.isLine||o.isPoints)o.visible=allowed.has(o);else o.visible=true;", "if(o.isMesh||o.isLine||o.isPoints||o.isSprite)o.visible=allowed.has(o);else o.visible=true;"],
 ["seed.models=Object.values(MODEL_CATALOG)", "seed.camera={position:[260,3300,1900],target:[260,0,-120]};\n seed.models=Object.values(MODEL_CATALOG)"]
]);
await edit('src/public-museum.js',[
 ["new THREE.MeshBasicMaterial({color:night?0x55564e:0xa48d70})", "new THREE.MeshBasicMaterial({color:night?0x55564e:0xa48d70,depthWrite:false})"],
 ["horizon.rotation.x=-Math.PI/2;", "horizon.renderOrder=-100;horizon.rotation.x=-Math.PI/2;"],
 ["{antialias:!mobile,powerPreference:'low-power'}", "{antialias:!mobile,powerPreference:'low-power',logarithmicDepthBuffer:true}"],
 ["const c=new THREE.Vector3(...s.center),span=", "for(const [other,job]of pending)if(other!==id)job.abort.abort();const c=new THREE.Vector3(...s.center),span="],
 ["metrics:()=>({...metrics,frameTimes:", "metrics:()=>({...metrics,roadMeshes:scene.children.filter(o=>o.userData.roadMesh).length,frameTimes:"]
]);
await edit('src/public-museum.css',[[".header-actions button{background:var(--panel);", ".header-actions button[aria-pressed=true]{background:#d3b477;color:#16383a}.header-actions button{background:var(--panel);"]]);
await edit('src/workshop-panel.js',[
 ["yaw:o.g.rotation.y,scale:1,visible:true}", "yaw:o.g.rotation.y,scale:published?.objects?.[o.record.id]?.scale??1,visible:true}"],
 ["const api={snapshot,select(id)", "const api={snapshot,roadsChanged:()=>save(),select(id)"]
]);
await edit('scripts/prepare-workshop.mjs',[["let editor=await readFile", "for(const file of ['index.html','workshop.html']){let source=await readFile(file,'utf8');source=source.replace('eveningScene?.refreshRoadEditor(roadEditor);}', 'eveningScene?.refreshRoadEditor(roadEditor);window.__MUSEUM_WORKSHOP?.roadsChanged?.();}');await writeFile(file,source);}\nlet editor=await readFile"]]);
await edit('tests/museum-split-browser.mjs',[["{mode,run:i+1,cache:'cold isolated browser context',wallMs:Date.now()-started,...measurement,errors}", "{...measurement,mode,run:i+1,cache:'cold isolated browser context',wallMs:Date.now()-started,errors}"]]);
console.log('SPLIT_V2_REFINEMENTS_APPLIED');
