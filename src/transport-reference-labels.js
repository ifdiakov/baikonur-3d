import * as THREE from 'three';

// Debug labels for authored AD and railway paths. The identifier is a
// deterministic digest of the underlying path ID, not a location-dependent
// sequence number; therefore different camera/LOD levels keep the same ID.
function referenceId(kind,source){
 const id=String(source.id??source.osmWayIds?.[0]??'unknown');
 let hash=2166136261;
 for(let i=0;i<id.length;i++)hash=Math.imul(hash^id.charCodeAt(i),16777619)>>>0;
 return (kind==='road'?'АД-':'ЖД-')+hash.toString(36).toUpperCase().padStart(6,'0').slice(-6);
}
const v3=p=>p?.isVector3?p:Array.isArray(p)?new THREE.Vector3(...p):new THREE.Vector3(p?.x||0,p?.y||0,p?.z||0);
function midpoint(points){
 if(!points?.length)return null;
 if(points.length===1)return v3(points[0]).clone();
 let total=0;const lengths=[];
 for(let i=1;i<points.length;i++){
  const a=v3(points[i-1]),b=v3(points[i]);
  const length=Math.hypot(a.x-b.x,a.z-b.z);
  lengths.push(length);total+=length;
 }
 if(total<.01)return v3(points[0]).clone();
 let remaining=total*.5;
 for(let i=1;i<points.length;i++){
  if(remaining<=lengths[i-1])return v3(points[i-1]).clone().lerp(v3(points[i]),remaining/(lengths[i-1]||1));
  remaining-=lengths[i-1];
 }
 return v3(points.at(-1)).clone();
}
function describe(path,kind){
 const source=path.osmWayIds?.length?'OSM '+path.osmWayIds.join(', '):path.id||'составной участок';
 return (kind==='road'?'Автодорога':'Железнодорожный путь')+' · '+source;
}
export function createTransportLabels({camera,renderer,roads=[],rails=[],grid=null}){
 const root=document.createElement('canvas');
 root.id='transportReferenceLabels';
 root.setAttribute('aria-hidden','true');
 root.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:44;display:none';
 document.body.appendChild(root);
 const context=root.getContext('2d');
 const holder=new THREE.Vector3();
 const rows=[],ids=new Map();
 for(const [kind,paths] of [['road',roads],['rail',rails]]){
  for(const path of paths){
   if(!path?.id||!path.points?.length)continue;
   const position=midpoint(path.points);if(!position)continue;
   const label=referenceId(kind,path),key=kind+':'+path.id;
   if(ids.has(key))continue;
   ids.set(key,label);
   position.y+=kind==='rail'?5:4;
   rows.push({kind,label,key,position,description:describe(path,kind)});
  }
 }
 let enabled=false,lastDraw=0,layoutWidth=0,layoutHeight=0;
 const button=document.getElementById('transportLabelsToggle');
 const legend=document.createElement('div');
 legend.id='transportReferenceLegend';
 legend.style.cssText='position:fixed;top:72px;right:14px;z-index:100;display:none;background:rgba(9,28,35,.88);border:1px solid rgba(226,199,126,.55);border-radius:8px;padding:7px 10px;color:#fff;font:700 11px/1.5 Arial;pointer-events:none';
 legend.textContent='АД — автодороги   ·   ЖД — железная дорога';
 document.body.appendChild(legend);
 function setEnabled(value){
  enabled=Boolean(value);root.style.display=enabled?'block':'none';legend.style.display=enabled?'block':'none';
  if(button){button.setAttribute('aria-pressed',String(enabled));button.textContent='🚧 МЕТКИ АД / ЖД · '+(enabled?'ВЫКЛ':'ВКЛ');}
  if(!enabled)context.clearRect(0,0,root.width,root.height);
  else lastDraw=0;
 }
 function draw(now=performance.now()){
  if(!enabled||now-lastDraw<190)return;
  lastDraw=now;
  const rect=renderer.domElement.getBoundingClientRect(),w=Math.round(rect.width),h=Math.round(rect.height);
  if(w<10||h<10)return;
  const ratio=Math.min(2,devicePixelRatio||1);
  const targetWidth=Math.round(w*ratio),targetHeight=Math.round(h*ratio);
  if(root.width!==targetWidth||root.height!==targetHeight){root.width=targetWidth;root.height=targetHeight;}
  context.setTransform(ratio,0,0,ratio,0,0);context.clearRect(0,0,w,h);
  // Draw only nearby paths. This is a screen overlay: never alters road/rail
  // geometry or intercepts drag/selection. Labels adapt to camera altitude.
  const labels=[];
  for(const row of rows){
   holder.copy(row.position).project(camera);
   if(holder.z<-1||holder.z>1||Math.abs(holder.x)>1.06||Math.abs(holder.y)>1.06)continue;
   const x=(holder.x+1)*.5*w,y=(1-holder.y)*.5*h;
   if(x<42||x>w-42||y<24||y>h-24)continue;
   const distance=camera.position.distanceTo(row.position);
   if(distance>Math.max(360,camera.position.y*3.2))continue;
   labels.push({...row,x,y,distance});
  }
  labels.sort((a,b)=>a.distance-b.distance||a.label.localeCompare(b.label));
  const occupancy=new Set(),cellX=112,cellY=42;
  let roadsShown=0,railsShown=0;
  context.textAlign='center';context.textBaseline='middle';context.font='bold 11px Arial';
  for(const row of labels){
   if(row.kind==='road'&&roadsShown>=95||row.kind==='rail'&&railsShown>=70)continue;
   const col=Math.floor(row.x/cellX),line=Math.floor(row.y/cellY),slot=col+':'+line;
   if(occupancy.has(slot))continue;
   occupancy.add(slot);
   if(row.kind==='road')roadsShown++;else railsShown++;
   const width=context.measureText(row.label).width+15,height=21;
   const x=Math.round(row.x),y=Math.round(row.y);
   context.fillStyle=row.kind==='road'?'rgba(17,46,55,.92)':'rgba(55,38,62,.92)';
   context.strokeStyle=row.kind==='road'?'#80d6dc':'#e0a9ec';
   context.lineWidth=1.2;
   context.beginPath();context.roundRect(x-width/2,y-height/2,width,height,5);context.fill();context.stroke();
   context.fillStyle='#fff';context.fillText(row.label,x,y+.3);
  }
 }
 button?.addEventListener('click',()=>setEnabled(!enabled));
 document.addEventListener('coordinate-grid-change',e=>setEnabled(Boolean(e.detail?.enabled)));
 setEnabled(enabled);
 window.__MUSEUM_TRANSPORT_LABELS={setEnabled,isEnabled:()=>enabled,count:()=>rows.length,
  lookup:label=>rows.find(r=>r.label===label)?.description??null,version:'transport-labels-v2-default-hidden'};
 return {setEnabled,isEnabled:()=>enabled,draw,count:()=>rows.length};
}
