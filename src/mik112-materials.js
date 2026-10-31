// Photo-guided finishes from the user's MIK 112 facade and overhead images.
// These are analytic, metre-based material details on the existing shared
// concrete/metal maps, not additional photographs or large texture downloads.
export function applyMik112PhotoFinishes(materials,root){
 for(const [name,finish] of [['wall','precast'],['doorMetal','corrugated'],['roof','roof'],['whiteRoof','roof']]){
  const material=materials[name],base=material.onBeforeCompile;
  material.onBeforeCompile=shader=>{
   base(shader);
   // The facade photographs show predominantly grey metal and pale panels.
   // Keep the shared wear relief subtle here; broad orange freckles would
   // incorrectly turn the large doors and roofs into a camouflage pattern.
   shader.uniforms.museumWear.value*=finish==='precast'?.35:finish==='corrugated'?.16:.20;
   shader.uniforms.museumRelief.value*=.45;
   if(finish==='corrugated')shader.uniforms.museumStain.value.setHex(0x73786d);
   else if(finish==='roof')shader.uniforms.museumStain.value.setHex(0x7f8274);
   let code='';
   if(finish==='precast')code=`
    vec3 mikN=abs(normalize(vMuseumNormal));
    float mikU=mix(vMuseumPosition.z,vMuseumPosition.x,step(mikN.x,mikN.z));
    vec2 mikUv=vec2(mikU,vMuseumPosition.y-2.6);
    vec2 mikPitch=vec2(6.0,1.5);
    vec2 mikCell=floor(mikUv/mikPitch);
    vec2 mikEdge=min(fract(mikUv/mikPitch),1.0-fract(mikUv/mikPitch))*mikPitch;
    vec2 mikAa=max(fwidth(mikUv),vec2(0.008));
    vec2 mikLines=1.0-smoothstep(vec2(0.013),vec2(0.013)+mikAa,mikEdge);
    float mikJoint=max(mikLines.x,mikLines.y);
    float mikPanel=fract(sin(dot(mikCell,vec2(127.1,311.7)))*43758.5453);
    float mikVertical=1.0-smoothstep(0.55,0.8,mikN.y);
    float mikDrip=pow(0.5+0.5*sin(mikU*2.9+sin(mikU*0.37)),10.0);
    float mikDirt=(0.045+0.10*mikDrip)*exp(-max(mikUv.y,0.0)/14.0);
    diffuseColor.rgb*=mix(1.0,0.94+mikPanel*0.10-mikJoint*0.18,mikVertical);
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.31,0.28,0.22),mikDirt*mikVertical);
   `;
   else if(finish==='corrugated')code=`
    vec3 mikN=abs(normalize(vMuseumNormal));
    float mikU=mix(vMuseumPosition.z,vMuseumPosition.x,step(mikN.x,mikN.z));
    float mikRib=sin(mikU*19.634954);
    float mikVisible=1.0-smoothstep(0.12,0.7,fwidth(mikU));
    diffuseColor.rgb*=1.0-mikVisible*(0.07+0.07*mikRib);
   `;
   else code=`
    vec2 mikUv=vMuseumPosition.xz;
    vec2 mikPitch=vec2(1.35,12.0);
    vec2 mikEdge=min(fract(mikUv/mikPitch),1.0-fract(mikUv/mikPitch))*mikPitch;
    vec2 mikAa=max(fwidth(mikUv),vec2(0.008));
    vec2 mikLines=1.0-smoothstep(vec2(0.012),vec2(0.012)+mikAa,mikEdge);
    float mikTop=smoothstep(0.6,0.9,abs(normalize(vMuseumNormal).y));
    diffuseColor.rgb*=1.0-max(mikLines.x,mikLines.y)*0.14*mikTop;
   `;
   shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',code+'\n#include <roughnessmap_fragment>');
  };
  material.customProgramCacheKey=()=>`museum-surface-v1-mik112-${finish}-v2`;
  material.userData.photoFinish={version:'mik112-photo-finish-v2',finish,units:'metres'};
 }
 root.userData.mik112PhotoMaterials={version:'mik112-photo-finish-v2',textureDownloads:0,
  details:['pale precast facade panels','fine corrugations on grey metal doors','green-grey glazing','sheet seams on contrasting low roofs','subtle base staining'],
  sourceImages:['145QNZxiY6xccOT95iSq-HjA76Ntu6iX3','1h7DeC5BCpxukDj4KTbTFf4ZCcldt9s91','1hz1YQ7bgab_0TYAWTqupU8IZMCCq7i_A'],
  interpretation:'Facade colour, joint rhythm and weathering interpreted from user photographs; no survey of individual stains.'};
}
