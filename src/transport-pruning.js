/** Remove only short terminal trees, retaining the source graph for routing.
 * Decisions use shared source nodes, not proximity or whole OSM way IDs.
 * The budget includes previously removed twigs, so repeated passes cannot
 * eat their way along a long approach one short segment at a time.
 */
export function pruneTerminalBranches(graph,{maxLength,eligible=()=>true,protectedEdges=new Set(),protectedNode=()=>false}={}){
 const adjacency=new Map(),removed=new Set(),absorbed=new Map(),branches=[];
 for(const edge of graph.edges)for(const node of [edge.a,edge.b]){
  if(!adjacency.has(node))adjacency.set(node,new Set());adjacency.get(node).add(edge);
 }
 const junctions=new Set([...adjacency.keys()].filter(node=>adjacency.get(node).size>2));
 const queue=[...adjacency.keys()].filter(node=>adjacency.get(node).size===1);
 for(let index=0;index<queue.length;index++){
  const start=queue[index];if(adjacency.get(start).size!==1)continue;
  const chain=[],nodes=[start];let node=start,previous=null,length=0,budget=0,safe=true;
  while(true){
   if(protectedNode(node)){safe=false;break;}
   const next=[...adjacency.get(node)].filter(edge=>edge!==previous);
   if((node!==start&&(adjacency.get(node).size!==2||junctions.has(node)))||!next.length)break;
   budget+=absorbed.get(node)||0;
   const edge=next[0];if(protectedEdges.has(edge)||!eligible(edge)){safe=chain.length>0;break;}
   chain.push(edge);length+=edge.length;budget+=edge.length;
   if(budget>maxLength){safe=false;break;}
   previous=edge;node=edge.a===node?edge.b:edge.a;nodes.push(node);
  }
  if(!safe||!chain.length||budget>maxLength)continue;
  for(const edge of chain){removed.add(edge);adjacency.get(edge.a).delete(edge);adjacency.get(edge.b).delete(edge);}
  const previousTwigs=absorbed.get(node)||0;
  for(const n of nodes)absorbed.delete(n);absorbed.set(node,budget+previousTwigs);
  branches.push({length,segments:chain.length,wayIds:[...new Set(chain.map(e=>e.wayId))],tip:start.position.toArray(),join:node.position.toArray()});
  if(adjacency.get(node).size===1)queue.push(node);
 }
 return {removed,stats:{maxLength,branchCount:branches.length,removedSegments:removed.size,
  removedLength:branches.reduce((sum,b)=>sum+b.length,0),affectedWayIds:[...new Set([...removed].map(e=>e.wayId))],branches}};
}
