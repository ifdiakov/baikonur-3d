import * as THREE from 'three';

/** Virtual highway guide signs on approximate roadside positions at the edges
 * of Baikonur's historical plan. Distances are rounded road-route distances
 * from Baikonur city, NOT precise kilometer-post chainage.
 */
export function buildHighwaySigns({data,point,parent}) {
  const signs=[];
  const blue=new THREE.MeshStandardMaterial({color:0x21558c,roughness:.8,metalness:.08,side:THREE.DoubleSide});
  const steel=new THREE.MeshStandardMaterial({color:0x8b9696,roughness:.51,metalness:.65});
  function paintSign(spec){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#19538e';ctx.fillRect(0,0,1024,512);
    ctx.strokeStyle='#eff7ff';ctx.lineWidth=13;ctx.strokeRect(14,14,996,484);
    ctx.font='600 24px Montserrat,Arial,sans-serif';
    ctx.fillStyle='#c7e2f7';ctx.textAlign='center';ctx.fillText('ОТ БАЙКОНУРА · ≈ ПО АВТОДОРОГЕ',512,67);
    const left=spec.direction==='west';
    for(const [i,route] of spec.destinations.entries()){
      const y=168+i*170;
      // Large arrows point OUT of the museum towards the target destination.
      const a=left?66:962,b=left?136:892;
      ctx.strokeStyle='#ffffff';ctx.lineWidth=10;
      ctx.beginPath();ctx.moveTo(b,y);ctx.lineTo(a,y);
      ctx.moveTo(a,y);ctx.lineTo(a+(left?25:-25),y-24);
      ctx.moveTo(a,y);ctx.lineTo(a+(left?25:-25),y+24);ctx.stroke();
      ctx.fillStyle='#fff';ctx.font='700 46px Montserrat,Arial,sans-serif';
      ctx.textAlign='left';ctx.fillText(route.city,182,y+15,558);
      ctx.textAlign='right';ctx.font='600 39px Montserrat,Arial,sans-serif';
      ctx.fillText('≈'+route.distanceKm+' км',875,y+15,240);
      if(i===0){ctx.strokeStyle='#c5def5a8';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(48,254);ctx.lineTo(976,254);ctx.stroke();}
    }
    const tex=new THREE.CanvasTexture(canvas);
    tex.colorSpace=THREE.SRGBColorSpace;
    tex.anisotropy=8;tex.minFilter=THREE.LinearMipmapLinearFilter;
    const group=new THREE.Group();group.name='Указатель '+spec.direction.toUpperCase();
    group.position.copy(point(spec.x,spec.y));
    // Two legs and narrow rectangular frame keep sign looking like road furniture.
    const height=28,signWidth=76,signHeight=38;
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(signWidth,signHeight),
      new THREE.MeshBasicMaterial({map:tex,transparent:false,side:THREE.DoubleSide}));
    panel.position.y=height+11;panel.position.z=.5;group.add(panel);
    const backplate=new THREE.Mesh(new THREE.BoxGeometry(signWidth+1.8,signHeight+1.2,1.1),blue);
    backplate.position.y=height+11;backplate.position.z=-.35;group.add(backplate);
    for(const side of [-1,1]){
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.54,.68,36,9),steel);
      pole.position.set(side*24,18,-1.2);group.add(pole);
    }
    const base=new THREE.Mesh(new THREE.BoxGeometry(63,.9,5),steel);
    base.position.y=.6;group.add(base);
    // Viewer looking from map's north or south can read both faces.
    group.userData={id:spec.id,source:'data/road-signs.json',
      approximateFromCity:true,destinations:spec.destinations.map(d=>({name:d.city,km:d.distanceKm}))};
    parent.add(group);signs.push(group);
  }
  paintSign(data.west);paintSign(data.east);
  return {signs,stats:()=>({
    signCount:signs.length,locations:signs.map(s=>({x:s.position.x,z:s.position.z})),
    cities:signs.flatMap(s=>s.userData.destinations),
    distancesFrom:'Baikonur city',approximate:true
  })};
}
