import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
for(const file of ['index.html','museum.html','workshop.html']){
 let s=await readFile(file,'utf8');if(s.includes('// DETAIL_FIDELITY_V2'))continue;
 const r=(before,after)=>{assert(s.includes(before),file+' '+before.slice(0,90));s=s.replace(before,after);};
 r('const ref=mzkSdiParent.g.userData.mzkSdi.views[component].target;','// Anchors are attached after the original archive builder has initialized and cleared its root.');
 r("anchor.position.set(ref[0],0,ref[2]);mzkSdiParent.g.add(anchor);",'');
 const installation='const portalArchive=installArchiveModels({objects,clickable,voids:portalVoids,checkpoint7Placement:checkpoint7Placement({roads:osmRoads,ownerRoadEdits,geography,roadPaths:transport.roadPaths()})});';
 r(installation,installation+`\n// DETAIL_FIDELITY_V2\nfor(const card of mzkSdiCards){const part=mzkSdiParent.g.userData.mzkSdi[card.component];const center=part.center||[part.position[0],part.position[2]];card.g.position.set(center[0],part.dimensions.height,center[1]);mzkSdiParent.g.add(card.g);card.archive=mzkSdiParent.archive;}\n`);
 r('legacyData:transportData,catalog,matches:osmMatches,siteRecords,checkpointAnchor,','legacyData:transportData,catalog,matches:osmMatches,siteRecords,checkpointAnchor,pixelRatio:Math.min(devicePixelRatio||1,2),');
 r("modelsForObject(r));o.g.getWorldPosition(ctl.target);","modelsForObject(o.component?mzkSdiParent.record:r));o.g.getWorldPosition(ctl.target);");
 r('rocketExhibits.prioritizeSite(r.id);steppeSurface.requestDetail();',"rocketExhibits.prioritizeSite(o.component?'pad-112a':r.id);steppeSurface.requestDetail();");
 r('museumKnowledge.renderSite(r.id,el);',"museumKnowledge.renderSite(r.id.startsWith('building-')?'pad-112a':r.id,el);");
 r('function updateLabels(){',`function placeBuildingCard(el,p,occupied,component){
 const w=el.offsetWidth||236,h=el.offsetHeight||155,low=innerWidth>850?338:8;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),x0=clamp(p.x+(innerWidth>850?(component==='mzk'?-126:126):0),low+w/2,innerWidth-w/2-8);
 const ys=[p.y,110+h*1.07,innerHeight-100+h*.07];for(const q of occupied)ys.push(q.bottom+12+h*1.07,q.top-12+h*.07);
 const ys2=ys.map(y=>clamp(y,90+h*1.07,innerHeight-80+h*.07)),xs=[x0,low+w/2,innerWidth-w/2-8];let best=null;
 for(const x of xs)for(const y of ys2){const box={left:x-w/2,right:x+w/2,top:y-h*1.07,bottom:y-h*.07};if(occupied.some(q=>!(box.right<q.left-6||box.left>q.right+6||box.bottom<q.top-6||box.top>q.bottom+6)))continue;const score=Math.abs(x-x0)+Math.abs(y-p.y);if(!best||score<best.score)best={x,y,box,score};}
 best??={x:x0,y:ys2[0],box:{left:x0-w/2,right:x0+w/2,top:ys2[0]-h*1.07,bottom:ys2[0]-h*.07}};el.style.left=best.x+'px';el.style.top=best.y+'px';return best.box;
}
function updateLabels(){`);
 r('candidates.sort((a,b)=>Number(b.d.i===activeSiteCard)',"candidates.sort((a,b)=>Number(!!cardObjects[b.d.i].component)-Number(!!cardObjects[a.d.i].component)||Number(b.d.i===activeSiteCard)");
 r('const rect=el.getBoundingClientRect();\n  const conflict=used.some', 'const rect=cardObjects[a.d.i].component?placeBuildingCard(el,a.p,used,cardObjects[a.d.i].component):el.getBoundingClientRect();\n  const conflict=used.some');
 r('el.style.display=collapsedSites.has(a.d.i)?"flex":"block";el.style.left=(a.p.x+(cardObjects[a.d.i].component===\'mzk\'?-126:cardObjects[a.d.i].component===\'sdi\'?126:0))+"px";el.style.top=a.p.y+"px";', 'if(!cardObjects[a.d.i].component){el.style.display=collapsedSites.has(a.d.i)?"flex":"block";el.style.left=a.p.x+"px";el.style.top=a.p.y+"px";}');
 await writeFile(file,s);
}
console.log('DETAIL_FIDELITY_REFINED');
