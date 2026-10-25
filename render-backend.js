'use strict';
/* Rendering only. Never creates physical states or changes accepted Float64 geometry. */
(function(root){
function split16(g,primitiveSize){
 const out=[];let map=new Map(),p=[],n=[],c=[],idx=[];
 function flush(){if(idx.length)out.push({p,n,c,idx:new Uint16Array(idx)});map=new Map();p=[];n=[];c=[];idx=[];}
 for(let i=0;i<g.idx.length;i+=primitiveSize){const ids=Array.from(g.idx.slice(i,i+primitiveSize));const fresh=new Set(ids.filter(x=>!map.has(x)));if(map.size+fresh.size>65535)flush();for(const old of ids){if(!map.has(old)){map.set(old,map.size);p.push(...g.p.slice(old*3,old*3+3));n.push(...g.n.slice(old*3,old*3+3));c.push(...g.c.slice(old*4,old*4+4));}idx.push(map.get(old));}}flush();return out;
}
function create(canvas){
 let gl=null,gl2=false;const options={antialias:true,preserveDrawingBuffer:true};
 try{gl=canvas.getContext('webgl2',options);gl2=!!gl;}catch(_){}
 if(!gl)try{gl=canvas.getContext('webgl',options)||canvas.getContext('experimental-webgl',options);}catch(_){}
 if(gl){
  const uint32=gl2||!!gl.getExtension('OES_element_index_uint');
  const vertex=gl2?'#version 300 es\nin vec3 p,n;in vec4 c;uniform mat4 V,P;out vec3 N;out vec4 C;void main(){N=n;C=c;gl_Position=P*V*vec4(p,1.);}':'attribute vec3 p,n;attribute vec4 c;uniform mat4 V,P;varying vec3 N;varying vec4 C;void main(){N=n;C=c;gl_Position=P*V*vec4(p,1.);}';
  const body='uniform float opacity,unlit;uniform vec3 tint;void main(){float light=mix(.46+.54*abs(dot(normalize(N),normalize(vec3(-.4,.8,1.)))),1.,unlit);OUTPUT=vec4(mix(C.rgb,tint,step(0.,tint.x))*light,C.a*opacity);}';
  const fragment=gl2?'#version 300 es\nprecision mediump float;in vec3 N;in vec4 C;out vec4 color;'+body.replace('OUTPUT','color'):'precision mediump float;varying vec3 N;varying vec4 C;'+body.replace('OUTPUT','gl_FragColor');
  const pr=gl.createProgram();for(const [type,src]of[[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('GPU shader: '+gl.getShaderInfoLog(s));gl.attachShader(pr,s);}gl.linkProgram(pr);if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw Error('GPU program: '+gl.getProgramInfoLog(pr));gl.useProgram(pr);
  const A=Object.fromEntries(['p','n','c'].map(x=>[x,gl.getAttribLocation(pr,x)])),U=Object.fromEntries(['V','P','opacity','tint','unlit'].map(x=>[x,gl.getUniformLocation(pr,x)]));gl.enable(gl.DEPTH_TEST);gl.clearColor(.925,.949,.959,1);
  function dispose(b){if(!b)return;for(const part of b.chunks||[])for(const k of ['p','n','c','idx'])if(part[k])gl.deleteBuffer(part[k]);}
  function upload(g,mode='triangles'){const b={chunks:[],mode};try{for(const source of uint32?[g]:split16(g,mode==='lines'?2:3)){const part={count:source.idx.length};b.chunks.push(part);for(const k of ['p','n','c','idx']){part[k]=gl.createBuffer();if(!part[k])throw Error('GPU allocation failed');const type=k==='idx'?gl.ELEMENT_ARRAY_BUFFER:gl.ARRAY_BUFFER;gl.bindBuffer(type,part[k]);gl.bufferData(type,k==='idx'?(uint32?new Uint32Array(source[k]):source[k]):new Float32Array(source[k]),gl.STATIC_DRAW);}}return b;}catch(e){dispose(b);throw e;}}
  return {mode:gl2?'webgl2':uint32?'webgl1-uint32':'webgl1-uint16',label:gl2?'WebGL2 · 完整几何':uint32?'WebGL1 · 完整几何':'WebGL1 · Uint16 无损分块 · 完整几何',upload,dispose,error:()=>gl.getError(),begin(camera,V,P){gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniformMatrix4fv(U.V,false,V);gl.uniformMatrix4fv(U.P,false,P);},draw(b,opacity=1,tint=null){if(!b)return;const transparent=opacity<1;if(transparent){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);}for(const part of b.chunks){for(const [k,size]of[['p',3],['n',3],['c',4]]){gl.bindBuffer(gl.ARRAY_BUFFER,part[k]);gl.vertexAttribPointer(A[k],size,gl.FLOAT,false,0,0);gl.enableVertexAttribArray(A[k]);}gl.uniform1f(U.opacity,opacity);gl.uniform1f(U.unlit,b.mode==='lines'?1:0);gl.uniform3fv(U.tint,tint||[-1,-1,-1]);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,part.idx);gl.drawElements(b.mode==='lines'?gl.LINES:gl.TRIANGLES,part.count,uint32?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT,0);}if(transparent){gl.depthMask(true);gl.disable(gl.BLEND);}},end(){}};
 }
 const ctx=canvas.getContext('2d');let camera,queue=[],submitted=0,painted=0;
 const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],lightAxis=[-.4/Math.sqrt(1.8),.8/Math.sqrt(1.8),1/Math.sqrt(1.8)];
 function projected(g){const out=new Float64Array(g.p.length);for(let i=0;i<g.p.length;i+=3){const r=[g.p[i]-camera.eye[0],g.p[i+1]-camera.eye[1],g.p[i+2]-camera.eye[2]];out[i]=dot(r,camera.x);out[i+1]=dot(r,camera.y);out[i+2]=-dot(r,camera.z);}return out;}
 function clip(vertices,near){const out=[];for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length],ai=a[2]>=near,bi=b[2]>=near;if(ai)out.push(a);if(ai!==bi){const t=(near-a[2])/(b[2]-a[2]);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]),near]);}}return out;}
 return {mode:ctx?'canvas2d-cpu':'unavailable',label:ctx?'CPU 3D 投影备用 · 完整 Float64 几何 · 软件深度缓冲，非 GPU 画质验收':'渲染不可用，记录校验与读数仍有效',upload:(g,mode='triangles')=>({g,mode}),dispose(){},error:()=>0,begin(c){camera=c;queue=[];submitted=0;painted=0;if(ctx){ctx.fillStyle='#ecf2f5';ctx.fillRect(0,0,canvas.width,canvas.height);}},draw(b,opacity=1,tint=null){if(!ctx||!b)return;const g=b.g,p=projected(g),size=b.mode==='lines'?2:3,f=canvas.height/(2*Math.tan(.375));for(let i=0;i<g.idx.length;i+=size){submitted++;const ids=Array.from(g.idx.slice(i,i+size));let vertices=ids.map(j=>[p[j*3],p[j*3+1],p[j*3+2]]);if(size===3)vertices=clip(vertices,.0001);else if(vertices.some(v=>v[2]<.0001))continue;if(vertices.length<size)continue;const xy=vertices.map(v=>[canvas.width/2+f*v[0]/v[2],canvas.height/2-f*v[1]/v[2]]);if(xy.every(v=>v[0]<0)||xy.every(v=>v[0]>canvas.width)||xy.every(v=>v[1]<0)||xy.every(v=>v[1]>canvas.height))continue;const color=tint||[0,1,2].map(k=>ids.reduce((s,j)=>s+g.c[j*4+k],0)/ids.length),normal=[0,1,2].map(k=>ids.reduce((s,j)=>s+g.n[j*3+k],0)/ids.length),norm=Math.hypot(...normal),light=size===2?1:.46+.54*Math.abs(dot(normal,lightAxis)/(norm||1));queue.push({xy,iz:vertices.map(v=>1/v[2]),z:vertices.reduce((s,v)=>s+v[2],0)/vertices.length,style:'rgba('+color.map(x=>Math.round(Math.max(0,Math.min(1,x*light))*255)).join(',')+','+opacity+')',line:size===2,overlay:opacity<1});}},end(){
 if(!ctx)return;
 const w=canvas.width,h=canvas.height,pixels=w*h,bitmap=ctx.createImageData(w,h),rgba=bitmap.data,depth=new Float64Array(pixels),glassDepth=new Float64Array(pixels),glass=new Uint8ClampedArray(pixels*4);
 depth.fill(Infinity);glassDepth.fill(Infinity);for(let i=0;i<rgba.length;i+=4){rgba[i]=236;rgba[i+1]=242;rgba[i+2]=245;rgba[i+3]=255;}
 function raster(t,transparent){
  const color=t.style.match(/[\d.]+/g).map(Number),target=transparent?glass:rgba,zbuf=transparent?glassDepth:depth;
  for(let fan=1;fan<t.xy.length-1;fan++){
   const a=t.xy[0],b=t.xy[fan],c=t.xy[fan+1],iz=[t.iz[0],t.iz[fan],t.iz[fan+1]],area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(Math.abs(area)<1e-12)continue;
   const minx=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),maxx=Math.min(w-1,Math.ceil(Math.max(a[0],b[0],c[0]))),miny=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),maxy=Math.min(h-1,Math.ceil(Math.max(a[1],b[1],c[1])));
   for(let y=miny;y<=maxy;y++)for(let x=minx;x<=maxx;x++){
    const px=x+.5,py=y+.5,u=((b[0]-px)*(c[1]-py)-(b[1]-py)*(c[0]-px))/area,v=((c[0]-px)*(a[1]-py)-(c[1]-py)*(a[0]-px))/area,q=1-u-v;if(u< -1e-9||v< -1e-9||q< -1e-9)continue;
    const z=1/(u*iz[0]+v*iz[1]+q*iz[2]),i=y*w+x;if(z>=zbuf[i]||(transparent&&z>depth[i]+1e-9))continue;zbuf[i]=z;const o=i*4;target[o]=color[0];target[o+1]=color[1];target[o+2]=color[2];target[o+3]=transparent?Math.round(color[3]*255):255;
   }
  }
 }
 for(const t of queue)if(!t.line&&!t.overlay)raster(t,false);
 for(const t of queue)if(!t.line&&t.overlay)raster(t,true);
 for(let i=0;i<pixels;i++)if(glassDepth[i]<Infinity){const o=i*4,a=glass[o+3]/255;for(let k=0;k<3;k++)rgba[o+k]=glass[o+k]*a+rgba[o+k]*(1-a);}
 ctx.putImageData(bitmap,0,0);
 for(const t of queue)if(t.line){ctx.beginPath();ctx.moveTo(...t.xy[0]);for(let i=1;i<t.xy.length;i++)ctx.lineTo(...t.xy[i]);ctx.strokeStyle=t.style;ctx.lineWidth=1.5;ctx.stroke();}
 painted=queue.length;
},stats:()=>({submitted_primitives:submitted,painted_primitives:painted,all_geometry:true,precision:'Float64',depth:'software z-buffer + nearest transparent surface'})};
}
const api={create,split16};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.KR90Renderer=api;
})(typeof globalThis!=='undefined'?globalThis:this);
