'use strict';
/* Fetch counts are decoded response bytes, never Content-Length or invented time. */
(function(root){
const abortError=()=>Object.assign(new Error('已取消加载'),{name:'AbortError'});
function errorMessage(e){return e?.name==='AbortError'?'已取消加载，点击重试重新开始':String(e?.message||e);}
function check(signal){if(signal?.aborted)throw abortError();}
function formatBytes(n){return n<1000?n+' B':n<1e6?(n/1000).toFixed(1)+' KB':(n/1e6).toFixed(2)+' MB';}
async function readAsset({url,label=url,expectedBytes,expectedSha256,signal,onProgress=()=>{},fetchImpl=root.fetch,cryptoImpl=root.crypto,cache='default'}){
 const total=Number.isSafeInteger(expectedBytes)&&expectedBytes>=0?expectedBytes:null;
 if(expectedBytes!==undefined&&total===null)throw Error(label+' 文件大小索引无效');
 let received=0;const report=phase=>onProgress({phase,label,receivedBytes:received,totalBytes:total});check(signal);report('download');
 const response=await fetchImpl(url,{signal,cache});check(signal);if(!response.ok)throw Error(label+' HTTP '+response.status);
 const chunks=[];let reader;
 const append=value=>{const bytes=value instanceof Uint8Array?value:new Uint8Array(value);received+=bytes.byteLength;if(total!==null&&received>total)throw Error(label+' 文件大小不匹配');chunks.push(bytes);report('download');};
 try{if(response.body?.getReader){reader=response.body.getReader();while(true){check(signal);const result=await reader.read();check(signal);if(result.done)break;append(result.value);}}else{append(await response.arrayBuffer());check(signal);}}catch(e){if(reader)try{await reader.cancel();}catch(_){}throw e;}
 finally{if(reader)try{reader.releaseLock();}catch(_) {}}
 if(total!==null&&received!==total)throw Error(label+' 文件大小不匹配');
 const bytes=new Uint8Array(received);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}check(signal);
 let digest=null;if(expectedSha256!==undefined){if(!/^[a-f0-9]{64}$/.test(expectedSha256))throw Error(label+' SHA256 索引无效');report('verify');digest=Array.from(new Uint8Array(await cryptoImpl.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');check(signal);if(digest!==expectedSha256)throw Error(label+' SHA256 不匹配');}
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);check(signal);report('done');return{text,bytes:received,sha256:digest};
}
function createUI(doc){
 const $=id=>doc.getElementById(id),panel=$('loadingPanel'),bar=$('loadingProgress'),rows={},states=new Map();let controller=null,phase='连接 / 等待响应';
 for(const [key,id]of [['trace','loadTrace'],['mesh','loadMesh'],['policy','loadPolicy']])rows[key]=$(id);
 function setPhase(text){phase=text;$('loadingTitle').textContent=text;panel.dataset.phase=text;bar.removeAttribute('value');$('loadingDetail').textContent='正在处理，请稍候';}
 function update(key,event){states.set(key,event);rows[key].textContent=event.phase==='verify'?'SHA256 校验中':event.phase==='done'?'校验完成':event.receivedBytes?formatBytes(event.receivedBytes)+(event.totalBytes!==null?' / '+formatBytes(event.totalBytes):' · 总大小未知'):'等待响应';
 const values=[...states.values()],known=values.length===3&&values.every(v=>v.totalBytes!==null),received=values.reduce((n,v)=>n+v.receivedBytes,0),total=values.reduce((n,v)=>n+(v.totalBytes||0),0);
 if(known&&total>0){bar.max=total;bar.value=received;$('loadingDetail').textContent='已接收 '+formatBytes(received)+' / '+formatBytes(total)+'（解码后 '+Math.floor(received/total*100)+'%）';}else{bar.removeAttribute('value');$('loadingDetail').textContent='已接收 '+formatBytes(received)+' · 总大小未知';}
 $('loadingTitle').textContent=values.some(v=>v.phase==='download')?'接收回放数据':values.some(v=>v.phase==='verify')?'SHA256 完整性校验':'数据校验完成';panel.dataset.phase=$('loadingTitle').textContent;
 }
 function start(c){controller=c;states.clear();panel.hidden=false;panel.classList.remove('load-error');$('loadingRetry').hidden=true;$('loadingCancel').hidden=false;$('loadingCancel').disabled=false;for(const row of Object.values(rows))row.textContent='等待响应';setPhase('连接 / 等待响应');$('loadingDetail').textContent='正在获取文件索引 · 总大小未知';$('loadingCancel').onclick=()=>{controller?.abort();$('loadingCancel').disabled=true;};}
 function fail(e){controller?.abort();panel.hidden=false;panel.classList.add('load-error');setPhase(e.name==='AbortError'?'已取消加载':'加载未完成');$('loadingDetail').textContent=errorMessage(e);$('loadingCancel').hidden=true;$('loadingRetry').hidden=false;}
 function ready(){panel.hidden=true;doc.body.dataset.loading='false';$('viewerMain').setAttribute('aria-busy','false');}
 return{start,update,setPhase,fail,ready,waitForRetry:()=>new Promise(resolve=>{$('loadingRetry').onclick=()=>{ $('loadingRetry').disabled=true;resolve();$('loadingRetry').disabled=false;};}),fatal:e=>{fail(e);$('loadingRetry').onclick=()=>root.location.reload();}};
}
const api={readAsset,formatBytes,errorMessage,createUI};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.KR90Loading=api;
})(typeof globalThis!=='undefined'?globalThis:this);
