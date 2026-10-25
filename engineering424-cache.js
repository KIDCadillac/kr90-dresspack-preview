'use strict';
/* Render-only, exact-input caches. No source frames or geometry are modified.
 * Mesh source keys and returned geometry are caller-owned immutable inputs.
 * A rigid signature must contain EVERY basis/translation/scale/color scalar
 * used by its builder. It is copied, never rounded, hashed, or interpolated.
 */
(function(root){
function objectKey(value){return value!==null&&(typeof value==='object'||typeof value==='function');}
function snapshotSignature(signature){
 if(!Array.isArray(signature)&&!(ArrayBuffer.isView(signature)&&typeof signature.length==='number'))throw TypeError('Rigid cache signature must be a numeric array');
 const copy=Array.from(signature);
 for(const value of copy)if(typeof value!=='number'||!Number.isFinite(value))throw TypeError('Rigid cache signature must contain finite Numbers');
 return copy;
}
function exactSignature(a,b){
 if(a.length!==b.length)return false;
 for(let i=0;i<a.length;i++)if(!Object.is(a[i],b[i]))return false;
 return true;
}
function createRigidGeometryCache(){
 let entries=new WeakMap();const counts={hits:0,misses:0,builds:0};
 return Object.freeze({
  get(key,signature,builder){
   if(!objectKey(key))throw TypeError('Rigid cache source key must be an object');
   if(typeof builder!=='function')throw TypeError('Rigid cache builder must be a function');
   const copied=snapshotSignature(signature),previous=entries.get(key);
   if(previous&&exactSignature(previous.signature,copied)){counts.hits++;return previous.geometry;}
   counts.misses++;
   // Publish only after a successful complete build. A failed attempt must not
   // invalidate a still-live scene or its previously reusable rigid geometry.
   const geometry=builder();
   if(geometry==null)return null;
   if(!objectKey(geometry))throw TypeError('Rigid cache builder must return a geometry object');
   entries.set(key,{signature:copied,geometry});counts.builds++;return geometry;
  },
  invalidate(key){return objectKey(key)?entries.delete(key):false;},
  clear(){entries=new WeakMap();},
  stats(){return {...counts};}
 });
}
function createUploadCache(renderer){
 if(!renderer||typeof renderer.upload!=='function'||typeof renderer.dispose!=='function')throw TypeError('Upload cache requires renderer.upload and renderer.dispose');
 const geometries=new WeakMap(),leases=new WeakMap(),counts={uploads:0,hits:0,references:0,entries:0,disposals:0};
 function acquire(geometry,mode='triangles'){
  if(geometry==null)return null;
  if(!objectKey(geometry))throw TypeError('Upload cache geometry must be an object');
  if(typeof mode!=='string')throw TypeError('Upload cache mode must be a string');
  let modes=geometries.get(geometry),entry=modes&&modes.get(mode);
  if(entry)counts.hits++;
  else{
   // renderer.upload owns cleanup of any partially allocated failed upload.
   // Do not publish a failed/null upload or alter older scene references.
   const buffer=renderer.upload(geometry,mode);
   if(buffer==null||buffer===false)throw Error('Renderer upload returned no buffer');
   if(!modes){modes=new Map();geometries.set(geometry,modes);}
   entry={buffer,mode,modes,references:0};modes.set(mode,entry);counts.uploads++;counts.entries++;
  }
  // Each acquisition needs its own lease: releasing staged/old scenes in either
  // order, or accidental duplicate cleanup, cannot release another scene's ref.
  const lease=Object.freeze({buffer:entry.buffer});leases.set(lease,entry);entry.references++;counts.references++;return lease;
 }
 function release(lease){
  if(!objectKey(lease))return false;
  const entry=leases.get(lease);if(!entry)return false;
  leases.delete(lease);entry.references--;counts.references--;
  if(entry.references===0){
   // Remove before dispose, including when renderer.dispose itself throws.
   // A repeated release must never dispose the same allocation twice.
   entry.modes.delete(entry.mode);counts.entries--;counts.disposals++;
   renderer.dispose(entry.buffer);
  }
  return true;
 }
 return Object.freeze({acquire,release,buffer(lease){const entry=objectKey(lease)&&leases.get(lease);return entry?entry.buffer:null;},stats(){return {...counts};}});
}
const api={createRigidGeometryCache,createUploadCache};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.KR90Engineering424Cache=api;
})(typeof globalThis!=='undefined'?globalThis:this);
