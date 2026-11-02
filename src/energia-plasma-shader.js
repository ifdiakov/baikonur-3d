import * as THREE from 'three';

// Soft, turbulent exhaust with correct depth testing in the museum's
// logarithmic-depth scene. The same program renders nozzle shells and
// crossed, edge-eroded plasma sheets.
export const ENERGIA_PLASMA_VERSION='energia-plasma-v1';
export function nozzleFlameMaterial(color,{ribbon=false}={}){
 return new THREE.ShaderMaterial({
  uniforms:{uPower:{value:0},uTime:{value:0},uTint:{value:new THREE.Color(color)},uRibbon:{value:ribbon?1:0}},
  vertexShader:[
   '#include <common>',
   '#include <logdepthbuf_pars_vertex>',
   'uniform float uTime,uRibbon;',
   'varying vec2 vUv;',
   'void main(){',
   ' vUv=uv;',
   ' float axial=clamp(uv.y,0.,1.);',
   ' vec3 p=position;',
   ' float angle=atan(p.z,p.x);',
   ' float tear=.16*sin(angle*7.+axial*12.-uTime*4.1)',
   '   +.086*sin(angle*11.-axial*21.+uTime*6.3)',
   '   +.042*sin(angle*17.+axial*31.-uTime*9.5);',
   ' if(uRibbon>.5){',
   '  float shoulder=sin(axial*3.14159265);',
   '  p.x+=(.26*sin(axial*23.-uTime*4.5+uv.x*10.)+.11*sin(uv.x*21.+uTime*7.2))*shoulder;',
   ' } else {',
   '  p.xz*=1.+tear*(.56+.44*axial);',
   '  p.x+=.13*sin(axial*16.-uTime*2.9+angle)*sin(axial*3.14159265);',
   '  p.z+=.13*cos(axial*18.+uTime*3.2-angle)*sin(axial*3.14159265);',
   ' }',
   ' gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);',
   ' #include <logdepthbuf_vertex>',
   '}'
  ].join('\n'),
  fragmentShader:[
   '#include <common>',
   '#include <logdepthbuf_pars_fragment>',
   'uniform float uPower,uTime,uRibbon;',
   'uniform vec3 uTint;',
   'varying vec2 vUv;',
   'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
   'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
   ' return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}',
   'float fbm(vec2 p){return .52*noise(p)+.28*noise(p*2.13)+.14*noise(p*4.17)+.06*noise(p*8.07);}',
   'void main(){',
   ' #include <logdepthbuf_fragment>',
   ' float axial=clamp(vUv.y,0.,1.);',
   ' float az=vUv.x*6.2831853;',
   ' vec2 flow=vec2(vUv.x*9.,axial*26.-uTime*2.9);',
   ' float rolling=fbm(flow+vec2(sin(axial*31.-uTime*7.)*.28,0.));',
   ' float fine=fbm(flow*2.7+vec2(0.,-uTime*6.7));',
   ' float turbulence=fbm(vec2(cos(az)*3.1+axial*7.8-uTime*.67,sin(az)*3.1-axial*8.1+uTime*.46));',
   ' float fracture=smoothstep(.24,.66,turbulence+.13*sin(az*11.+axial*47.-uTime*8.));',
   ' float filament=pow(.5+.5*sin(az*12.+axial*57.-uTime*11.+rolling*6.),6.);',
   ' float ragged=mix(.34+.66*fracture,.24+.76*fracture,uRibbon);',
   ' float edge=abs(vUv.x*2.-1.);',
   ' float sideMask=1.-smoothstep(.43+.14*turbulence,.96,edge);',
   ' ragged*=mix(1.,sideMask,uRibbon);',
   ' float tip=smoothstep(.006,.13,axial);',
   ' float mouth=1.-smoothstep(.87,1.,axial);',
   ' float shock=pow(.5+.5*cos((1.-axial)*86.+rolling*2.),18.)*smoothstep(.20,.6,axial);',
   ' float opacity=clamp(uPower*tip*mouth*ragged*(.55+.42*axial)*(.73+.39*rolling+.18*fine)*(.83+.17*filament),0.,.97);',
   ' vec3 plasma=mix(uTint,vec3(1.,.96,.84),pow(axial,2.4)*.73);',
   ' plasma*=1.20+1.05*axial+.27*shock+.17*filament;',
   ' plasma+=vec3(1.,.77,.41)*shock*.31;',
   ' gl_FragColor=vec4(plasma,opacity);',
   '}'
  ].join('\n'),
  transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,
  blending:THREE.AdditiveBlending,toneMapped:false
 });
}
