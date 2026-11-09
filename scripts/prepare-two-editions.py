from pathlib import Path
root=Path(__file__).resolve().parents[1]
s=(root/'index.html').read_text()
s=s.replace('<head>', '<head>\n<meta name="robots" content="noindex,nofollow">\n<link rel="stylesheet" href="./src/workshop-tools.css?v=20261109-editions-v1">',1)
s=s.replace("try{\nconst attribution=", "const WORKSHOP_MODE=!new URLSearchParams(location.search).has('viewer')&&!new URLSearchParams(location.search).has('bakePublic');\ntry{\nconst attribution=",1)
s=s.replace('button:null,readOnly:true,','button:null,readOnly:!WORKSHOP_MODE,',1)
s=s.replace('./src/road-editor.js?v=20261108-highway-palette-site105-v1','./src/road-editor.js?v=20261109-workshop-v1')
old="const ownerRoadEditsReady=startup.fetchJSON('./data/road-edits-authoritative-20261103.json?v=20261108-no-road-105',{optional:true});"
new="const ownerRoadEditsReady=Promise.all([startup.fetchJSON('./data/road-edits-authoritative-20261103.json?v=20261108-no-road-105',{optional:true}),startup.fetchJSON('./data/workshop-state.json',{optional:true})]).then(([base,authored])=>authored?.roads||base);"
assert old in s,'Road data source changed; review workshop patch'
s=s.replace(old,new,1)
api="""window.__WORKSHOP_SCENE={scene,camera,ctl,renderer,objects,layers,transport,roadEditor,coordinateGrid,cameraAltitude,transportLabels,ground,satelliteGround,outerTerrain,terrainRelief,sharedSiloHill,steppeSurface,museumTerrainHeightAt,requestTransportDetail,portalArchive,eveningScene,groundTraffic,point,flankDistricts};
if(WORKSHOP_MODE){cameraAltitude.setEnabled(true);coordinateGrid.setEnabled(true);transportLabels.setEnabled(true);}else{for(const id of ['coordinateGridToggle','transportLabelsToggle']){const b=document.getElementById(id);if(b)b.hidden=true;}}
window.__WORKSHOP_READY=import('./src/workshop-tools.js?v=20261109-editions-v1').then(m=>m.installWorkshopTools(window.__WORKSHOP_SCENE,{enabled:WORKSHOP_MODE}));
"""
assert 'window.__BAIKONUR_QA={' in s
s=s.replace('window.__BAIKONUR_QA={',api+'window.__BAIKONUR_QA={',1)
s=s.replace('<body>','<body>\n<script>if(!new URLSearchParams(location.search).has("viewer")){const u=new URL(location.href);u.searchParams.set("tour","0");history.replaceState(null,"",u);}</script>',1)
s=s.replace('currentObject=i;selectSiteCard(i);', "currentObject=i;if(WORKSHOP_MODE)window.dispatchEvent(new CustomEvent('workshop-selection',{detail:r.id}));selectSiteCard(i);",1)
(root/'workshop.html').write_text(s)
p=root/'src/road-editor.js';s=p.read_text()
if 'replaceState(data)' not in s:
 old='return {get active(){return active;},setActive,undo,redo,finish,attachRoadMeshes,'
 new="""return {get active(){return active;},setActive,undo,redo,finish,attachRoadMeshes,
  listPaths:()=>routes.map(r=>({...r,points:r.points.map(p=>[...p])})),
  replaceState(data){if(readOnly)throw Error('Редактор доступен только в мастерской');const next=validateRoadEdits(data);checkpoint();Object.assign(state,next);draft=[];render();return clone();},"""
 assert old in s,'Road editor API changed; review patch'
 p.write_text(s.replace(old,new,1))
print('WORKSHOP_PREPARED')
