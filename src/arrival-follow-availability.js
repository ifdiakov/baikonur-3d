// Follow availability uses the map itself, not the larger free-camera apron.
export function arrivalFollowAvailable(state,bounds,suppressed=false){
 if(suppressed||!state?.visible||!state.position||!bounds)return false;
 const {x,z}=state.position,{minX,maxX,minZ,maxZ}=bounds;
 if(![x,z,minX,maxX,minZ,maxZ].every(Number.isFinite)||minX>=maxX||minZ>=maxZ)return false;
 return x>=minX&&x<=maxX&&z>=minZ&&z<=maxZ;
}
