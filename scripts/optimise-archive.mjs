import {readFileSync,writeFileSync} from 'node:fs';
let s=readFileSync('src/archive-kit.js','utf8');
if(!s.includes('STATIC_ARCHIVE_BATCHES')){
 const a=s.indexOf(' function add('),b=s.indexOf(' function box(',a);if(a<0||b<0)throw Error('Archive batch anchors not found');
 s=s.slice(0,a)+` // STATIC_ARCHIVE_BATCHES: bake static hall-local transforms into exhibit space.
 function add(geo,m,p,q,size,tag,parent=root){
  if(!mat[m])throw Error('Unknown archive material '+m);
  const transform=new THREE.Matrix4().compose(new THREE.Vector3(...p),q,new THREE.Vector3(...size));
  let cursor=parent;
  while(cursor&&cursor!==root){cursor.updateMatrix();transform.premultiply(cursor.matrix);cursor=cursor.parent;}
  if(cursor!==root)throw Error('Archive primitive has an unrelated parent');
  const key=geo.uuid+':'+m;
  let batch=batches.get(key);if(!batch){batch={geo,m,parent:root,matrices:[]};batches.set(key,batch);}
  batch.matrices.push(transform);count(tag);
 }
`+s.slice(b);writeFileSync('src/archive-kit.js',s);
}
