// Photo-guided finishes from the user's MIK 112 facade and overhead images,
// including the six additional references supplied on 2026-11-10.
// These are analytic, metre-based material details on the existing shared
// concrete/metal maps, not additional photographs or large texture downloads.
export function applyMik112PhotoFinishes(materials,root){
 // The new facade photograph shows pale grey panels and cool green glazing;
 // the exposed crane girders are red-brown, not the yellow of the TUA forks.
 // Apply these to the hall's existing shared palette without changing light.
 for(const [name,color]of Object.entries({wall:0xd8ddd8,concrete:0xa9aaa0,seam:0x89928b,
  roof:0x6d7978,whiteRoof:0xc3cbc6,steel:0x7d8983,dark:0x343e3a,
  rust:0x985b43,glass:0x4b6b61,doorMetal:0x929d97}))materials[name]?.color.setHex(color);
 materials.glass.roughness=.5;materials.glass.metalness=.16;
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
    float mikDirt=(0.035+0.075*mikDrip)*exp(-max(mikUv.y,0.0)/12.0);
    // A small number of long streaks below exposed roof edges. The broad
    // intact white wall stays readable rather than becoming a rust texture.
    float mikRoofDrip=pow(0.5+0.5*sin(mikU*0.83+sin(mikU*0.21)),16.0);
    mikDirt+=mikRoofDrip*0.075*exp(-abs(mikUv.y-48.0)/9.0);
    diffuseColor.rgb*=mix(1.0,0.96+mikPanel*0.075-mikJoint*0.16,mikVertical);
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.30,0.32,0.28),mikDirt*mikVertical);
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
  material.customProgramCacheKey=()=>`museum-surface-v1-mik112-${finish}-v3`;
  material.userData.photoFinish={version:'mik112-photo-finish-v3',finish,units:'metres'};
 }
 root.userData.mik112PhotoMaterials={version:'mik112-photo-finish-v3',textureDownloads:0,
  details:['pale grey precast facade panels','fine corrugations on grey metal doors','green-grey glazing','red-brown exposed crane girders','sheet seams on retained low roofs','subtle base and roof-edge staining'],
  referenceUpdate:'2026-11-10',additionalPhotoCount:6,
  sourceImages:['145QNZxiY6xccOT95iSq-HjA76Ntu6iX3','1h7DeC5BCpxukDj4KTbTFf4ZCcldt9s91','1hz1YQ7bgab_0TYAWTqupU8IZMCCq7i_A',
   '1cYEt-Gtz3KAL_wXd8YlK9ULaWRiSKdFH','1anAu2wy_vF8lJxTcRsJDuI5-fMqbPNwZ','1yGMsRnn0tnmXW6mnAVu9ekJeEps3tikm',
   '1GrxiHFO7ecnDfK614piOG_DjegNj7-fU','1UE_Xx81lHHpzkS_M2TlXHLHTHs587ThB','1PqhywvoaBd_rYlFTcw7uiSgSTXWvK7eX'],
  interpretation:'Facade colour, panel rhythm and weathering interpreted from user photographs; image upload date does not establish photography date. No survey of individual stains.'};
}
