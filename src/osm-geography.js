// Geographic placement for the existing museum models. OSM source coordinates
// remain separate from the illustrative model scale and local model anchors.
// © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright

export const OSM_GEOGRAPHY_VERSION = 'osm-geography-v1';
const EARTH_RADIUS = 6371008.8;
const DEG = Math.PI / 180;
const ORIGIN_LON = 63.35, ORIGIN_LAT = 45.85;
const ORIGIN_X = 650, ORIGIN_Y = 522.5;
const REFERENCE_LAT = 45.9256;
export const METRES_PER_MAP_UNIT = 65;
export const WORLD_UNITS_PER_MAP_UNIT = 3.4;
const X_METRES_PER_DEGREE = EARTH_RADIUS * DEG * Math.cos(REFERENCE_LAT * DEG);
const Y_METRES_PER_DEGREE = EARTH_RADIUS * DEG;

const ref = (type, id, name) => Object.freeze({type,id,name,url:`https://www.openstreetmap.org/${type}/${id}`});

// These resolve the intended exhibit by its explicit name/function, rather than
// selecting an unrelated OSM polygon merely because it has the same number.
// Coordinates are from the timestamped source archived in data/osm.
export const OSM_RUNTIME_ANCHORS = Object.freeze({
  'pad-75': Object.freeze({
    lonLat:Object.freeze([63.3209869,45.8705206]),
    refs:Object.freeze([ref('node',4395821037,'Семь ветров')]),
    role:'named-hotel-point',
    reason:'Владелец определил экспонат как гостиницу «7 ветров»; использована одноимённая гостиница, а не другой контур Site 75.'
  }),
  'pad-92': Object.freeze({
    lonLat:Object.freeze([62.93313499100798,46.05749733326602]),
    refs:Object.freeze([ref('way',454633553,'Site 92 (Missile processing)')]),
    role:'named-processing-compound-centroid',
    reason:'Экспонат каталога — техническая позиция / МИК; выбран явно подписанный контур Missile processing.'
  }),
  'pad-112a': Object.freeze({
    lonLat:Object.freeze([63.31480015780847,45.93903436712525]),
    refs:Object.freeze([
      ref('way',172704643,'MZK fueling for Energia/Buran'),
      ref('way',172704656,'SDI test stand used for Energia/Buran')
    ]),
    role:'named-components-midpoint',
    reason:'Общая музейная модель МЗК и СДИ поставлена между двумя явно подписанными сооружениями. Это выбор положения общего экспоната; номер 112А в OSM не подтверждён.'
  })
});

const finitePair = value => Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
const pair = (a,b) => Array.isArray(a) ? [Number(a[0]),Number(a[1])] : [Number(a),Number(b)];
const copyRefs = refs => (refs || []).map(item=>({type:item.type,id:item.id,name:item.name||'',url:item.url||`https://www.openstreetmap.org/${item.type}/${item.id}`}));
const median = values => {const s=[...values].sort((a,b)=>a-b),n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2;};

export function projectOsm(lon,lat){
  [lon,lat]=pair(lon,lat);
  if(!Number.isFinite(lon)||!Number.isFinite(lat))throw new TypeError('Invalid geographic coordinates');
  return [ORIGIN_X+(lon-ORIGIN_LON)*X_METRES_PER_DEGREE/METRES_PER_MAP_UNIT,
    ORIGIN_Y-(lat-ORIGIN_LAT)*Y_METRES_PER_DEGREE/METRES_PER_MAP_UNIT];
}

export function inverseProjectOsm(x,y){
  [x,y]=pair(x,y);
  if(!Number.isFinite(x)||!Number.isFinite(y))throw new TypeError('Invalid museum coordinates');
  return [ORIGIN_LON+(x-ORIGIN_X)*METRES_PER_MAP_UNIT/X_METRES_PER_DEGREE,
    ORIGIN_LAT-(y-ORIGIN_Y)*METRES_PER_MAP_UNIT/Y_METRES_PER_DEGREE];
}

function originalPosition(record){
  const original=record.originalSchematic;
  return original&&Number.isFinite(original.x)&&Number.isFinite(original.y)
    ? [original.x,original.y] : [record.x,record.y];
}

function solve(matrix,rhs){
  const rows=matrix.map((row,i)=>[...row,rhs[i]]),n=rhs.length;
  for(let c=0;c<n;c++){
    let pivot=c;for(let r=c+1;r<n;r++)if(Math.abs(rows[r][c])>Math.abs(rows[pivot][c]))pivot=r;
    [rows[c],rows[pivot]]=[rows[pivot],rows[c]];
    if(Math.abs(rows[c][c])<1e-12)throw new Error('Degenerate geography control points');
    const scale=rows[c][c];for(let j=c;j<=n;j++)rows[c][j]/=scale;
    for(let r=0;r<n;r++)if(r!==c){const v=rows[r][c];for(let j=c;j<=n;j++)rows[r][j]-=v*rows[c][j];}
  }
  return rows.map(row=>row[n]);
}

function weightedFit(anchors,weights,axis){
  const matrix=Array.from({length:3},()=>[0,0,0]),rhs=[0,0,0];
  anchors.forEach((a,i)=>{
    const terms=[1,(a.from[0]-ORIGIN_X)/650,(a.from[1]-ORIGIN_Y)/522.5],d=a.to[axis]-a.from[axis];
    for(let r=0;r<3;r++){rhs[r]+=weights[i]*terms[r]*d;for(let c=0;c<3;c++)matrix[r][c]+=weights[i]*terms[r]*terms[c];}
  });
  return solve(matrix,rhs);
}

function createLegacyWarp(anchors){
  if(anchors.length<3){
    return {point:(x,y)=>pair(x,y),jacobian:()=>1,
      report:{kind:'identity-fallback',anchors:anchors.length,minimumJacobian:1,blend:0}};
  }
  let weights=anchors.map(()=>1),cx,cy;
  const affineAt=(x,y)=>[x+cx[0]+cx[1]*(x-ORIGIN_X)/650+cx[2]*(y-ORIGIN_Y)/522.5,
    y+cy[0]+cy[1]*(x-ORIGIN_X)/650+cy[2]*(y-ORIGIN_Y)/522.5];
  // Robust affine fit keeps isolated inconsistent positions on the old diagram
  // from pulling entire neighbouring districts into a fold.
  for(let pass=0;pass<6;pass++){
    cx=weightedFit(anchors,weights,0);cy=weightedFit(anchors,weights,1);
    const errors=anchors.map(a=>{const p=affineAt(...a.from);return Math.hypot(p[0]-a.to[0],p[1]-a.to[1]);});
    const threshold=Math.max(18,median(errors)*1.7);
    weights=errors.map(e=>Math.min(1,threshold/Math.max(e,1e-9)));
  }
  let base=[1+cx[1]/650,cx[2]/522.5,cy[1]/650,1+cy[2]/522.5];
  if(base[0]<.25||base[3]<.25||base[0]*base[3]-base[1]*base[2]<.25){
    cx=[median(anchors.map(a=>a.to[0]-a.from[0])),0,0];
    cy=[median(anchors.map(a=>a.to[1]-a.from[1])),0,0];
    base=[1,0,0,1];
  }
  const priority={'pad-23':8,'city':3,'airfield':2,'pad-31':2,'pad-1':2,'pad-251':2};
  const controls=anchors.map((a,i)=>{
    const p=affineAt(...a.from),r=[a.to[0]-p[0],a.to[1]-p[1]],length=Math.hypot(...r),cap=Math.min(1,72/(length||1));
    return {x:a.from[0],y:a.from[1],r:[r[0]*cap,r[1]*cap],weight:weights[i]*(priority[a.id]||1)};
  });
  const softening=170,soft2=softening*softening;
  function field(x,y){
    let sum=0,sx=0,sy=0,dx=0,dy=0,xx=0,xy=0,yx=0,yy=0;
    for(const a of controls){
      const ax=x-a.x,ay=y-a.y,den=ax*ax+ay*ay+soft2,w=a.weight/(den*den),wx=-4*w*ax/den,wy=-4*w*ay/den;
      sum+=w;sx+=w*a.r[0];sy+=w*a.r[1];dx+=wx;dy+=wy;
      xx+=wx*a.r[0];xy+=wy*a.r[0];yx+=wx*a.r[1];yy+=wy*a.r[1];
    }
    if(sum<=0)return {r:[0,0],j:[0,0,0,0]};
    const rx=sx/sum,ry=sy/sum;
    return {r:[rx,ry],j:[(xx-rx*dx)/sum,(xy-rx*dy)/sum,(yx-ry*dx)/sum,(yy-ry*dy)/sum]};
  }
  let blend=1,minimum=Infinity;
  const validationBounds={minX:-600,maxX:1900,minY:-400,maxY:1600},step=50;
  for(let attempt=0;attempt<16;attempt++){
    minimum=Infinity;let safe=true;
    for(let y=validationBounds.minY;y<=validationBounds.maxY;y+=step)for(let x=validationBounds.minX;x<=validationBounds.maxX;x+=step){
      const d=field(x,y).j,j=base.map((v,i)=>v+blend*d[i]),det=j[0]*j[3]-j[1]*j[2];
      minimum=Math.min(minimum,det);if(det<.25||j[0]<.25||j[3]<.25)safe=false;
    }
    if(safe)break;blend*=.72;
  }
  const at=(x,y)=>{
    [x,y]=pair(x,y);if(!Number.isFinite(x)||!Number.isFinite(y))throw new TypeError('Invalid historical plan point');
    const a=affineAt(x,y),r=field(x,y).r;
    return [a[0]+blend*r[0],a[1]+blend*r[1]];
  };
  const jacobian=(x,y)=>{const j=field(x,y).j.map((v,i)=>base[i]+blend*v);return j[0]*j[3]-j[1]*j[2];};
  return {point:at,jacobian,report:{kind:'robust-affine-smoothed-residual',anchors:anchors.length,
    blend,softening,maximumResidual:72,minimumJacobian:minimum,validationBounds,validationStep:step,
    affine:{x:cx,y:cy},meaning:'Approximate registration of authored schematic layers; exact source positions are placed separately.'}};
}

function sourceCentroid(element){
  if(element?.type==='node'&&Number.isFinite(element.lon)&&Number.isFinite(element.lat))return [element.lon,element.lat];
  const pts=element?.geometry?.map(p=>[p.lon,p.lat]);
  if(!pts||pts.length<4||pts[0][0]!==pts.at(-1)[0]||pts[0][1]!==pts.at(-1)[1])return null;
  const origin=pts[0];let area=0,x=0,y=0;
  for(let i=1;i<pts.length;i++){
    const a=[pts[i-1][0]-origin[0],pts[i-1][1]-origin[1]],b=[pts[i][0]-origin[0],pts[i][1]-origin[1]],cross=a[0]*b[1]-b[0]*a[1];
    area+=cross;x+=(a[0]+b[0])*cross;y+=(a[1]+b[1])*cross;
  }
  return Math.abs(area)>1e-20?[origin[0]+x/(3*area),origin[1]+y/(3*area)]:null;
}

function resolveRuntimeAnchor(id,sourceMap){
  const preset=OSM_RUNTIME_ANCHORS[id];if(!preset)return null;
  const points=preset.refs.map(r=>sourceCentroid(sourceMap.get(`${r.type}/${r.id}`)));
  const lonLat=points.every(finitePair)?[points.reduce((s,p)=>s+p[0],0)/points.length,points.reduce((s,p)=>s+p[1],0)/points.length]:[...preset.lonLat];
  return {...preset,lonLat,refs:copyRefs(preset.refs)};
}

export function createMuseumGeography({catalog,matches,sourceElements}={}){
  if(!Array.isArray(catalog?.sites))throw new TypeError('Museum catalogue is required');
  const matchRows=Array.isArray(matches)?matches:matches?.matches||[];
  const matchMap=new Map(matchRows.map(m=>[m.siteId,m]));
  const raw=Array.isArray(sourceElements)?sourceElements:sourceElements?.elements||[];
  const sourceMap=new Map(raw.map(e=>[`${e.type}/${e.id}`,e]));
  const resolved=new Map(),groups=new Map();
  for(const record of catalog.sites){
    if(record.aliasOf||record.render===false)continue;
    const override=resolveRuntimeAnchor(record.id,sourceMap),match=matchMap.get(record.id);
    if(override){resolved.set(record.id,{lonLat:override.lonLat,refs:override.refs,role:override.role,
      status:'owner-name-resolution',reason:override.reason,sourceKey:null});continue;}
    if(!match?.status?.startsWith('exact-')||!finitePair(match.representativeLonLat))continue;
    const primary=match.representativeSource,sourceKey=primary?`${primary.type}/${primary.id}`:null;
    resolved.set(record.id,{lonLat:[...match.representativeLonLat],refs:copyRefs(match.osmRefs),
      role:match.status==='exact-facility'?'facility-source-centroid':'compound-source-centroid',
      status:match.status,reason:match.reasonRussian||'',sourceKey});
    if(sourceKey){if(!groups.has(sourceKey))groups.set(sourceKey,[]);groups.get(sourceKey).push(record);}
  }
  const shared=new Map();
  for(const [key,records] of groups)if(records.length>1){
    const center=records.reduce((a,r)=>{const p=originalPosition(r);return[a[0]+p[0]/records.length,a[1]+p[1]/records.length];},[0,0]);
    records.forEach(r=>shared.set(r.id,{key,records:records.map(s=>s.id),originalCenter:center}));
  }
  const anchors=[];
  for(const record of catalog.sites){
    const r=resolved.get(record.id);if(!r||shared.has(record.id))continue;
    const from=originalPosition(record);if(!finitePair(from))continue;
    anchors.push({id:record.id,from,to:projectOsm(r.lonLat)});
  }
  const warp=createLegacyWarp(anchors);
  const sites=catalog.sites.map(record=>{
    const from=originalPosition(record),source=resolved.get(record.id);
    const result={...record,originalSchematic:{x:from[0],y:from[1]},
      originalPositionBasis:record.originalPositionBasis??record.positionBasis??null};
    let p;
    if(source){
      p=projectOsm(source.lonLat);const common=shared.get(record.id);
      const positionKind=common?'shared-compound-relative':source.status;
      let displayOffset=[0,0];
      if(common){
        const oldPoint=warp.point(from),oldCenter=warp.point(common.originalCenter);
        displayOffset=[oldPoint[0]-oldCenter[0],oldPoint[1]-oldCenter[1]];
        p=[p[0]+displayOffset[0],p[1]+displayOffset[1]];
      }
      result.geoSource={kind:'osm',status:positionKind,sourceLonLat:[...source.lonLat],
        displayLonLat:inverseProjectOsm(p),refs:copyRefs(source.refs),role:source.role,
        sourceTimestamp:matches?.source?.osmBaseTimestamp||'2026-10-28T17:10:51Z',
        modelAnchor:'illustrative',reason:source.reason,
        ...(common?{sharedWith:common.records.filter(id=>id!==record.id),displayOffset}:{}),
      };
      result.positionBasis='OpenStreetMap: '+source.refs.map(r=>`${r.type}/${r.id}`).join(', ');
      result.positionConfidence=common?'shared-territory-relative':source.status==='owner-name-resolution'?'osm-named-exhibit':'osm-named-source';
    }else{
      p=warp.point(from);
      result.geoSource={kind:'schematic-registration',status:'inferred',displayLonLat:inverseProjectOsm(p),
        refs:[],modelAnchor:'illustrative',reason:'Точное соответствие объекта OSM не выбрано; положение перенесено гладкой привязкой исходной музейной схемы.'};
      result.positionBasis='Приблизительная регистрация исторической схемы относительно объектов OpenStreetMap';
      result.positionConfidence='approximate-registration';
    }
    result.x=p[0];result.y=p[1];
    return result;
  });
  const siteMap=new Map(sites.map(s=>[s.id,s]));
  for(const record of sites)if(record.aliasOf&&siteMap.has(record.aliasOf)){
    const target=siteMap.get(record.aliasOf);record.x=target.x;record.y=target.y;
    record.geoSource={kind:'alias',status:'alias',canonicalId:record.aliasOf};
  }
  const active=sites.filter(s=>!s.aliasOf&&s.render!==false);
  const bounds={minX:Math.min(0,...active.map(s=>s.x-120)),maxX:Math.max(1300,...active.map(s=>s.x+120)),
    minY:Math.min(0,...active.map(s=>s.y-120)),maxY:Math.max(1045,...active.map(s=>s.y+120))};
  const projection=Object.freeze({kind:'local-equirectangular',originLonLat:[ORIGIN_LON,ORIGIN_LAT],originPlan:[ORIGIN_X,ORIGIN_Y],
    referenceLatitude:REFERENCE_LAT,metresPerMapUnit:METRES_PER_MAP_UNIT,worldMetresPerUnit:METRES_PER_MAP_UNIT/WORLD_UNITS_PER_MAP_UNIT,
    worldUnitsPerMetre:WORLD_UNITS_PER_MAP_UNIT/METRES_PER_MAP_UNIT,northAxis:'negative-plan-y'});
  const report={version:OSM_GEOGRAPHY_VERSION,catalogEntries:sites.length,activeSites:active.length,
    anchored:resolved.size,exact:[...resolved.values()].filter(s=>s.status.startsWith('exact-')).length,
    resolvedByName:[...resolved.values()].filter(s=>s.status==='owner-name-resolution').length,
    inferred:active.length-resolved.size,aliases:sites.length-active.length,sharedCompoundSites:shared.size,
    sourcePointPositions:resolved.size-shared.size,sharedCompoundPositions:shared.size,
    projection,bounds:{...bounds},warp:warp.report,
    anchoredIds:[...resolved.keys()],inferredIds:active.filter(s=>!resolved.has(s.id)).map(s=>s.id),
    attribution:'© OpenStreetMap contributors',attributionUrl:'https://www.openstreetmap.org/copyright'};
  return {project:projectOsm,inverseProject:inverseProjectOsm,legacyPoint:warp.point,
    legacyJacobian:warp.jacobian,sites,bounds,projection,
    metresPerMapUnit:METRES_PER_MAP_UNIT,worldMetresPerUnit:METRES_PER_MAP_UNIT/WORLD_UNITS_PER_MAP_UNIT,
    worldUnitsPerMetre:WORLD_UNITS_PER_MAP_UNIT/METRES_PER_MAP_UNIT,
    stats:()=>structuredClone(report)};
}
