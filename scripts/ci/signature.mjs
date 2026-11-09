// Canonical form for in-memory vs JSON-saved geometry evidence.
// Undefined object properties are absent in JSON; actual values remain strict.
export function canonicalSignature(value){
 if(typeof value==='number'&&!Number.isFinite(value))throw Error('Non-finite signature value');
 if(Array.isArray(value))return value.map(v=>v===undefined?null:canonicalSignature(v));
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonicalSignature(value[k])]));
 if(['function','symbol','bigint'].includes(typeof value))throw Error('Non-serializable signature');
 return value;
}
