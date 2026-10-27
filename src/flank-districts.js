import * as THREE from 'three';

/**
 * Thematic RocketTrip design-school districts, not administrative borders or
 * surveyed launch-site ownership. Boundaries follow the historical diagram
 * loosely and exist ONLY at the flank zoom level.
 */
export const FLANK_DISTRICTS = [
  {key:'left',name:'ЧЕЛОМЕЙ',color:0xd45a91,school:'ОКБ-52 · школа универсальных ракет',
   speciality:'Тяжёлые носители, управляемые ракеты и орбитальные комплексы',
   accomplishments:'УР-100 · УР-500 «Протон» · «Алмаз»',
   note:'Унификация ракетной техники, тяжёлые носители и долговременные орбитальные системы.',
   source:'https://www.ras.ru/nappelbaum/2397d9ea-f53c-45eb-a57b-9061d3527a59.aspx?hidetoc=0'},
  {key:'center',name:'КОРОЛЁВ',color:0x39bad2,school:'ОКБ-1 · школа пилотируемой космонавтики',
   speciality:'Ракеты Р-7, первый спутник и пилотируемые корабли',
   accomplishments:'Р-7 · «Спутник» · «Восток» · «Союз»',
   note:'От первой межконтинентальной ракеты Р-7 к первым орбитальным полётам человека.',
   source:'https://russianspaceweb.com/baikonur_r7_1.html'},
  {key:'right',name:'ЯНГЕЛЬ',color:0xefb65d,school:'ОКБ-586 · днепровская ракетная школа',
   speciality:'Стратегические ракеты на долгохранимых компонентах топлива',
   accomplishments:'Р-12 · Р-16 · Р-36 · семейство «Циклон»',
   note:'Отработка надёжных боевых ракет и космических носителей на их основе.',
   source:'https://cosmosinter.ru/encyclopaedia/en_constructor/detail.php?ID=31'}
];

export function buildFlankDistricts(scene, point, W, H) {
  const startY=58,endY=735,segments=40;
  const leftEdge=y=>440+34*Math.sin(y/122)+18*Math.sin(y/54);
  const rightEdge=y=>875+31*Math.sin(y/150+.6)-22*Math.sin(y/70);
  const zoneMeshes=[],boundaries=[],accents=[];
  const cursor=new THREE.Vector3();
  const leftX=y=>[0,leftEdge(y),rightEdge(y)][0];
  const boundaryCoords=[leftEdge,rightEdge];

  function world(x,y,height=-1.7){return point(x,y,height)}
  for(let index=0;index<3;index++){
    const def=FLANK_DISTRICTS[index];
    const x0=index===0?(()=>0):(index===1?leftEdge:rightEdge);
    const x1=index===0?leftEdge:(index===1?rightEdge:(()=>W));
    const positions=[],fades=[],triangles=[];
    const columns=7;
    for(let j=0;j<=segments;j++){
      const y=startY+(endY-startY)*j/segments;
      const fadeY=Math.max(0,Math.min(1,(y-startY)/75,(endY-y)/82));
      for(let k=0;k<=columns;k++){
        const t=k/columns,x=x0(y)+(x1(y)-x0(y))*t;
        const at=world(x,y,-1.72);
        positions.push(at.x,at.y,at.z);
        const fadeOuter=Math.max(0,Math.min(1,x/52,(W-x)/52));
        fades.push(fadeY*fadeOuter);
      }
    }
    for(let j=0;j<segments;j++)for(let k=0;k<columns;k++){
      const a=j*(columns+1)+k,b=a+1,c=a+columns+1,d=c+1;
      triangles.push(a,c,b,b,c,d);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geo.setAttribute('districtFade',new THREE.Float32BufferAttribute(fades,1));
    geo.setIndex(triangles);
    geo.computeVertexNormals();
    const shader=new THREE.ShaderMaterial({
      uniforms:{uColor:{value:new THREE.Color(def.color)},uOpacity:{value:0}},
      vertexShader: `attribute float districtFade;
varying float vFade;
void main(){vFade=districtFade;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;
void main(){gl_FragColor=vec4(uColor,uOpacity*vFade);}`,
      transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide
    });
    const mesh=new THREE.Mesh(geo,shader);
    mesh.name='Тематический район '+def.name;mesh.visible=false;mesh.renderOrder=3;
    scene.add(mesh);zoneMeshes.push(mesh);
  }
  // Floating cyber-map borders in two tones. They follow the SAME level alpha as
  // the flank cards. No borders remain when the cards are faded.
  for(let i=0;i<2;i++){
    const points=[];
    for(let j=0;j<=segments*2;j++){
      const y=startY+(endY-startY)*j/(segments*2);
      const x=boundaryCoords[i](y);
      points.push(world(x,y,-1.52));
    }
    const geometry=new THREE.BufferGeometry().setFromPoints(points);
    const lineMaterial=new THREE.LineDashedMaterial({
      color:i===0?0xe983b3:0x8fd8d9,dashSize:19,gapSize:10,
      transparent:true,opacity:0,depthWrite:false,depthTest:false
    });
    const line=new THREE.Line(geometry,lineMaterial);
    line.computeLineDistances();line.renderOrder=5;line.visible=false;
    scene.add(line);boundaries.push(line);
    // A muted inner rail gives the district boundary the layered Night-City feel.
    const secondMaterial=new THREE.LineBasicMaterial({
      color:i===0?0x82456c:0x428fa2,transparent:true,opacity:0,
      depthTest:false,depthWrite:false
    });
    const second=new THREE.Line(geometry,secondMaterial);
    second.visible=false;second.renderOrder=4;scene.add(second);accents.push(second);
  }
  // Thin perpendicular grid ticks are graphical district-map details, not roads.
  for(let i=0;i<3;i++){
    const points=[];
    for(let y=158;y<695;y+=74){
      const x=i===0?Math.max(35,leftEdge(y)-76):
              i===1?(leftEdge(y)+rightEdge(y))*.5:
              Math.min(W-35,rightEdge(y)+76);
      const a=world(x-19,y,-1.47),b=world(x+19,y,-1.47);
      points.push(a.x,a.y,a.z,b.x,b.y,b.z);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    const mesh=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({
      color:FLANK_DISTRICTS[i].color,transparent:true,opacity:0,
      depthTest:false,depthWrite:false
    }));
    mesh.name='Скан-линии тематического района '+FLANK_DISTRICTS[i].name;
    mesh.visible=false;scene.add(mesh);accents.push(mesh);
  }
  let alpha=0;
  const setOpacity=level=>{
    alpha=Math.max(0,Math.min(1,level));
    const visible=alpha>.035;
    for(const m of zoneMeshes){
      m.visible=visible;
      m.material.uniforms.uOpacity.value=alpha*.18;
    }
    for(const b of boundaries){b.visible=visible;b.material.opacity=alpha*.89;}
    for(const a of accents){a.visible=visible;a.material.opacity=alpha*.30;}
  };
  setOpacity(0);
  return {setOpacity,state:()=>({
    alpha,zoneCount:zoneMeshes.length,
    visibleZones:zoneMeshes.filter(x=>x.visible).length,
    visibleBoundaries:boundaries.filter(x=>x.visible).length,
    thematicOnly:true
  })};
}
