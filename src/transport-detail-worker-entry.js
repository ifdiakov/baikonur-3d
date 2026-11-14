import {buildTransportDetail,cutTransportGeometry} from './transport-detail-build.js?v=20261114-ground-contact-v1';
import {transferBuffers} from './transport-detail-codec.js?v=20261114-ground-contact-v1';
self.onmessage=({data:{id,action,input}})=>{
 try{const start=performance.now();const value=action==='build'?buildTransportDetail(input):action==='cut'?cutTransportGeometry(input):(()=>{throw Error('Unknown transport operation')})();
  self.postMessage({id,value,elapsedMs:performance.now()-start},transferBuffers(value));
 }catch(error){self.postMessage({id,error:error.stack||error.message||String(error)});}
};
