import * as THREE from 'three';

// Energia-Polyus: the nozzle itself glows below the rocket (a separate soft
// sprite). The shaft has NO crossing ribbon planes or upward-facing streaks.
// Its upper collar is narrow/mostly transparent, while the lower exhaust
// deforms and dissolves irregularly. Retain logarithmic depth testing.
export const ENERGIA_PLASMA_VERSION='energia-plasma-v2-soft-nozzle-frayed-tail';

export function nozzleFlameMaterial(color){
 return new THREE.ShaderMaterial({
  uniforms:{
   uPower:{value:0},
   uTime:{value:0},
   uTint:{value:new THREE.Color(color)}
  },
  vertexShader:[
   '#include <common>',
   '#include <logdepthbuf_pars_vertex>',
   'uniform float uTime;',
   'varying vec2 vUv;',
   'void main(){',
   ' vUv=uv;',
   ' float axial=clamp(uv.y,0.,1.);', // 1: nozzle, 0: bottom of exhaust
   ' float tail=1.-axial;',
   ' float tailChaos=pow(tail,1.65);',
   ' vec3 p=position;',
   ' float a=atan(p.z,p.x);',
   // Only the lower part is spatially torn. Close to the rocket there is no
   // overshooting ribbon, jagged crown or ballooning cone mouth.
   ' float warp=.13*sin(a*7.+axial*18.-uTime*4.3)',
   '   +.09*sin(a*11.-axial*26.+uTime*6.7)',
   '   +.06*sin(a*17.+axial*43.-uTime*10.4);',
   ' p.xz*=1.+warp*(.06+1.72*tailChaos);',
   ' p.x+=tailChaos*(1.4*sin(axial*17.-uTime*3.8+a)+.7*sin(axial*35.+uTime*7.1-a));',
   ' p.z+=tailChaos*(1.3*cos(axial*21.+uTime*4.1-a)+.7*cos(axial*32.-uTime*6.3+a));',
   // Uneven physical fringe prevents a planar lower end-cap silhouette.
   ' p.y+=tailChaos*(1.65*sin(a*9.-uTime*3.8)+.9*cos(a*15.+uTime*5.6));',
   ' gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);',
   ' #include <logdepthbuf_vertex>',
   '}'
  ].join('\n'),
  fragmentShader:[
   '#include <common>',
   '#include <logdepthbuf_pars_fragment>',
   'uniform float uPower,uTime;',
   'uniform vec3 uTint;',
   'varying vec2 vUv;',
   'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
   'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
   ' return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),',
   ' mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}',
   'float fbm(vec2 p){return .52*noise(p)+.28*noise(p*2.13)+.14*noise(p*4.17)+.06*noise(p*8.07);}',
   'void main(){',
   ' #include <logdepthbuf_fragment>',
   ' float axial=clamp(vUv.y,0.,1.);',
   ' float tail=1.-axial;',
   ' float az=vUv.x*6.2831853;',
   ' vec2 flow=vec2(cos(az)*3.8+axial*6.8-uTime*.73,',
   '               sin(az)*3.8-axial*6.1+uTime*.49);',
   ' float broad=fbm(flow);',
   ' float fine=fbm(flow*2.4+vec2(uTime*.4,-uTime*.8));',
   ' float torn=.55*sin(az*9.+axial*31.-uTime*5.5)',
   '           +.32*sin(az*15.-axial*55.+uTime*9.2)',
   '           +.17*sin(az*21.+axial*72.-uTime*12.1);',
   // A continuous, gently glowing collar below the nozzle, not projecting
   // rays over the rocket. Sprite glows provide the local high brightness.
   ' float topLimit=1.-.89*smoothstep(.72,.96,axial);',
   // Individual tongues break off at different lower heights/angles.
   ' float lowerCut=smoothstep(.026,.22,axial+(.095*torn+.07*(broad-.48))*pow(tail,1.4));',
   ' float tailFray=mix(1.,.30+.70*smoothstep(.17,.70,broad+.24*torn),pow(tail,1.5));',
   ' float turbulence=.72+.45*broad+.22*fine+.14*torn;',
   ' float filament=pow(.5+.5*sin(az*12.+axial*57.-uTime*11.+broad*6.),6.);',
   ' float shock=pow(.5+.5*cos((1.-axial)*86.+broad*2.),18.)*smoothstep(.20,.60,axial);',
   ' float opacity=clamp(uPower*lowerCut*topLimit*tailFray',
   '  *(.42+.52*axial)*turbulence*(.84+.16*filament),0.,.95);',
   ' vec3 plasma=mix(uTint,vec3(1.,.97,.88),pow(axial,2.2)*.76);',
   ' plasma*=1.18+1.12*axial+.22*shock+.22*filament;',
   ' plasma+=vec3(1.,.75,.35)*shock*.29;',
   ' gl_FragColor=vec4(plasma,opacity);',
   '}'
  ].join('\n'),
  transparent:true,
  depthWrite:false,
  depthTest:true,
  side:THREE.DoubleSide,
  blending:THREE.AdditiveBlending,
  toneMapped:false
 });
}
