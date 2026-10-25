'use strict';
const kr90LoadingUI=KR90Loading.createUI(document);
(async function(){
const $=id=>document.getElementById(id),cv=$('view'),K=KR90State,E=KR90Engineering424,C=KR90Engineering424Cache,{add,sub,scale,dot,cross,unit}=K;
let DATA,MESH,META,BUNDLE,PARTITION,envelope,currentCase,store,geometry=null,activeGPU=null,frameIndex=0,playing=false,lastPlayback=0,drawCount=0,drawn=null,selected=-1,dirty=true,requestCounter=0;
let ready=false,startupController=null;
let view={yaw:0,pitch:.65,dist:2,center:[.35,0,-.1]};
const status=(s,bad=false)=>{$('status').title='';$('status').textContent=s;$('status').className='status'+(bad?' stop':'');};
function freeze(o){if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.values(o).forEach(freeze);Object.freeze(o);}return o;}
const paint=()=>new Promise(resolve=>setTimeout(resolve,0));
async function phase(text,signal){kr90LoadingUI.setPhase(text);await paint();if(signal?.aborted)throw Object.assign(new Error('已取消加载'),{name:'AbortError'});}
while(true){
 const controller=new AbortController();startupController=controller;kr90LoadingUI.start(controller);const signal=controller.signal;
 try{
  const manifest=await KR90Loading.readAsset({url:'bundle.json',label:'文件索引',signal,cache:'no-cache'});
  await phase('解析文件索引',signal);BUNDLE=JSON.parse(manifest.text);
  if(BUNDLE.schema!=='KR90_ENGINEERING424_VIEWER_BUNDLE_V1'||BUNDLE.trace_file!=='trace.json')throw Error('来源索引无效');
  if(BUNDLE.render_policy_file!=='render-policy.json'||typeof BUNDLE.render_policy_sha256!=='string')throw Error('424 几何策略缺失');
  const specs=[['trace','trace.json','计算帧',BUNDLE.trace_sha256],['mesh','mesh.json','机器人 / 外壳',BUNDLE.mesh_sha256],['policy','render-policy.json','显示策略',BUNDLE.render_policy_sha256]];
  for(const [key,file,label]of specs)kr90LoadingUI.update(key,{phase:'download',label,receivedBytes:0,totalBytes:Number.isSafeInteger(BUNDLE.decoded_asset_bytes?.[file])?BUNDLE.decoded_asset_bytes[file]:null});
  const texts=await Promise.all(specs.map(async([key,file,label,hash])=>{
   if(typeof hash!=='string'||! /^[a-f0-9]{64}$/.test(hash))throw Error(label+' SHA256 索引无效');
   return (await KR90Loading.readAsset({url:file+'?v='+hash,label,expectedBytes:BUNDLE.decoded_asset_bytes?.[file],expectedSha256:hash,signal,onProgress:event=>{if(!signal.aborted)kr90LoadingUI.update(key,event);}})).text;
  }));
  await phase('解析计算帧',signal);const parsedTrace=JSON.parse(texts[0]);
  await phase('验证原生帧与完整管线',signal);DATA=freeze(E.validateTrace(parsedTrace));META=DATA.metadata;
  await phase('解析机器人 / 外壳',signal);MESH=freeze(JSON.parse(texts[1]));
  await phase('验证 CAD 分区与显示策略',signal);PARTITION=freeze(E.validateHousingPartition(JSON.parse(texts[2]),MESH,META));
  if(!PARTITION.source_pins.some(p=>p.path.endsWith('/TRAJECTORY.json')&&p.sha256===BUNDLE.trace_sha256))throw Error('几何策略与轨迹不匹配');
  envelope=new Float64Array(DATA.frames.flatMap(f=>f.edge_endpoints_root_m.flat(2)));if(BUNDLE.frame_count!==DATA.frames.length)throw Error('帧数量不匹配');
  break;
 }catch(e){controller.abort();status(String(e.message||e),true);kr90LoadingUI.fail(e);await kr90LoadingUI.waitForRetry();}
}
await phase('初始化 3D 显示',startupController.signal);
const renderer=KR90Renderer.create(cv);if(renderer.mode==='unavailable')throw Error('当前浏览器无法绘制模型，请更换支持 3D 的浏览器后重试');
$('rendererMode').textContent=renderer.mode==='canvas2d-cpu'?'CPU 投影':renderer.mode==='unavailable'?'渲染不可用':'3D';$('rendererMode').title=renderer.label;
const gpuCache=C.createUploadCache(renderer),upload=(g,mode='triangles')=>gpuCache.acquire(g,mode),dispose=b=>gpuCache.release(b),draw=(b,o=1,t=null)=>renderer.draw(gpuCache.buffer(b),o,t);
function disposeScene(s){if(!s)return;for(const b of [...s.robots,s.cable,s.housing,s.guide,s.retractor,s.directors])dispose(b);}
function uploadScene(g){const s={robots:[]};try{for(const r of g.robots)s.robots.push(upload(r));for(const k of ['cable','housing','guide','retractor'])s[k]=g[k]?upload(g[k],g[k].mode||'triangles'):null;s.directors=upload(g.directors,'lines');if(renderer.error()!==0)throw Error('GPU staging failed');return s;}catch(e){disposeScene(s);throw e;}}
async function applyFrame(index){
 const requestedCase=currentCase,req=++requestCounter,ticket=store.begin();index=Math.max(0,Math.min(requestedCase.frames.length-1,index|0));
 let staged=null;
 try{const f=requestedCase.frames[index];E.validateFrame(f,META,index);const g=E.buildGeometry(f,MESH,META,PARTITION,{segmented:$('debugSegments').checked});if(req!==requestCounter)return false;staged=uploadScene(g);const committed=store.commit(f,g,ticket);if(!committed.ok){disposeScene(staged);return false;}
 const old=activeGPU;activeGPU=staged;geometry=g;frameIndex=index;selected=-1;disposeScene(old);updateReadouts(f);dirty=true;return true;
 }catch(e){if(staged)disposeScene(staged);store.reject(e,ticket);if(req===requestCounter){setPlaying(false);status('记录异常，保留当前帧',true);$('status').title=String(e.message||e);$('timeline').value=frameIndex;}return false;}
}
// Display rounding only: retain exact signed source numbers in data/QA.
function displayFixed(x,d){const text=x.toFixed(d);return Number(text)===0?(0).toFixed(d):text;}
function updateReadouts(f){
 $('timeline').max=currentCase.frames.length-1;$('timeline').value=frameIndex;$('timeline').disabled=!ready||currentCase.frames.length<2;
 $('frameCount').textContent=(frameIndex+1)+' / '+currentCase.frames.length;
 $('generation').textContent='F'+f.frame_index+' · 间隙 '+(f.max_joint_gap_m*1e6).toFixed(1)+' μm';$('generation').title='原始最大原生关节间隙；表面桥接仅用于显示，不改变碰撞或数值状态';
 $('time').innerHTML=f.time_s.toFixed(3)+' <small>s</small>';
 $('stroke').innerHTML=displayFixed(f.slider_q_m*1000,3)+' <small>mm</small>';
 $('velocity').innerHTML=displayFixed(f.slider_qdot_m_s*1000,3)+' <small>mm/s</small>';
 for(let i=0;i<6;i++)$('a'+(i+1)).textContent=displayFixed(f.joint_angles_deg[i],i<3?0:3)+'°';
 const bend=f.diagnostics.bend;$('bendWarning').textContent='最小离散弯曲半径 '+(bend.min_discrete_radius_m*1000).toFixed(1)+' mm · '+bend.joints_below_conditional_150mm+' 处 < 150 mm（条件对照）';$('bendWarning').classList.toggle('below',bend.joints_below_conditional_150mm>0);
 $('picked').textContent='';$('play').disabled=!ready||currentCase.frames.length<2;status(ready?'计算帧':'准备首帧');
}
function setPlaying(on){playing=on;$('play').textContent=on?'暂停':'播放';$('play').setAttribute('aria-pressed',String(on));lastPlayback=performance.now();}
async function choose(){setPlaying(false);currentCase=DATA;store=new E.AtomicStore(META);if(await applyFrame(0)){fit();return true;}return false;}
$('timeline').oninput=e=>{setPlaying(false);applyFrame(+e.target.value);};
$('play').onclick=async()=>{if(playing){setPlaying(false);return;}if(frameIndex===currentCase.frames.length-1&&!await applyFrame(0))return;setPlaying(true);};
function camera(){const eye=add(view.center,scale([Math.cos(view.pitch)*Math.sin(view.yaw),-Math.cos(view.pitch)*Math.cos(view.yaw),Math.sin(view.pitch)],view.dist)),z=unit(sub(eye,view.center)),x=unit(cross([0,0,1],z)),y=cross(z,x);return{eye,z,x,y};}
function projection(asp){const t=1/Math.tan(.375),n=Math.max(.0001,view.dist/10000),f=Math.max(50,view.dist*5);return new Float32Array([t/asp,0,0,0,0,t,0,0,0,0,(f+n)/(n-f),-1,0,0,2*f*n/(n-f),0]);}
function viewMatrix(c){return new Float32Array([c.x[0],c.y[0],c.z[0],0,c.x[1],c.y[1],c.z[1],0,c.x[2],c.y[2],c.z[2],0,-dot(c.x,c.eye),-dot(c.y,c.eye),-dot(c.z,c.eye),1]);}
function bounds(sets){const mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];for(const p of sets)for(let i=0;i<p.length;i+=3)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],p[i+k]);mx[k]=Math.max(mx[k],p[i+k]);}return{mn,mx,center:mn.map((v,i)=>(v+mx[i])/2)};}
function fitSets(sets,preserve=false){const b=bounds(sets);if(!preserve){view.yaw=0;view.pitch=.65;}view.center=b.center;const c=camera(),asp=cv.clientWidth/Math.max(1,cv.clientHeight),tanV=Math.tan(.375),tanH=tanV*asp,pad=.06;let d=.15;for(const p of sets)for(let i=0;i<p.length;i+=3){const r=sub(Array.from(p.slice(i,i+3)),view.center);d=Math.max(d,dot(r,c.z)+Math.max((Math.abs(dot(r,c.x))+pad)/tanH,(Math.abs(dot(r,c.y))+pad)/tanV));}view.dist=d*1.12;dirty=true;}
function allSets(){return[...(geometry.housing?[geometry.housing.p]:[]),...(geometry.guide?[geometry.guide.p]:[]),geometry.cable.p,geometry.retractor.p,envelope,...($('showRobot').checked?geometry.robots.map(r=>r.p):[])];}
function reveal(){/* Reset does not jump the mobile page away from its controls. */}
function fit(){if(geometry)fitSets(allSets());}
$('fit').onclick=()=>{fit();reveal();};
$('debugSegments').onchange=()=>{applyFrame(frameIndex);};
for(const id of ['inside','showRobot','showDirectors','showGuide'])$(id).onchange=()=>{$('guideTag').hidden=!$('showGuide').checked;dirty=true;};
function rayHit(o,d,p,idx){let best=Infinity;for(let k=0;k<idx.length;k+=3){const a=Array.from(p.slice(idx[k]*3,idx[k]*3+3)),b=Array.from(p.slice(idx[k+1]*3,idx[k+1]*3+3)),c=Array.from(p.slice(idx[k+2]*3,idx[k+2]*3+3)),e1=sub(b,a),e2=sub(c,a),h=cross(d,e2),det=dot(e1,h);if(Math.abs(det)<1e-13)continue;const inv=1/det,s=sub(o,a),u=dot(s,h)*inv;if(u<0||u>1)continue;const q=cross(s,e1),v=dot(d,q)*inv;if(v<0||u+v>1)continue;const t=dot(e2,q)*inv;if(t>0&&t<best)best=t;}return best;}
function select(x,y){if(!geometry)return;const rect=cv.getBoundingClientRect(),c=camera(),nx=(x-rect.left)/rect.width*2-1,ny=1-(y-rect.top)/rect.height*2,d=unit(add(scale(c.z,-1),add(scale(c.x,nx*Math.tan(.375)*rect.width/rect.height),scale(c.y,ny*Math.tan(.375)))));let distance=Infinity,best=-1,label='';const targets=[...($('showRobot').checked?geometry.robots.map((g,i)=>({g,i,label:'机器人 '+g.node})):[]),{g:geometry.cable,i:-2,label:'管线'},...(geometry.retractor.mode==='lines'?[]:[{g:geometry.retractor,i:-4,label:'滑块'}])];for(const t of targets){if(!t.g)continue;const hit=rayHit(c.eye,d,t.g.p,t.g.idx);if(hit<distance){distance=hit;best=t.i;label=t.label;}}selected=best;$('picked').textContent=label;dirty=true;}
const pointers=new Map();let gesture=null;
function setGesture(){const p=[...pointers.values()];if(p.length===2)gesture={cx:(p[0].x+p[1].x)/2,cy:(p[0].y+p[1].y)/2,dist:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)};else gesture=null;}
function pan(dx,dy){const c=camera(),s=2*view.dist*Math.tan(.375)/Math.max(1,cv.clientHeight);view.center=add(view.center,add(scale(c.x,-dx*s),scale(c.y,dy*s)));dirty=true;}
cv.oncontextmenu=e=>e.preventDefault();cv.onpointerdown=e=>{e.preventDefault();if(pointers.size>=2&&!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,button:e.button,touch:e.pointerType==='touch',moved:false});cv.setPointerCapture(e.pointerId);if(pointers.size===2)for(const p of pointers.values())p.moved=true;setGesture();};
cv.onpointermove=e=>{const p=pointers.get(e.pointerId);if(!p)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;p.moved=p.moved||Math.hypot(p.x-p.sx,p.y-p.sy)>5;if(pointers.size===2){const old=gesture;setGesture();if(old&&gesture){pan(gesture.cx-old.cx,gesture.cy-old.cy);if(old.dist>0&&gesture.dist>0)view.dist=Math.max(.08,Math.min(20,view.dist*old.dist/gesture.dist));dirty=true;}for(const v of pointers.values())v.moved=true;return;}if(p.button===2||p.touch||(p.button===0&&p.moved)){view.yaw-=dx*.007;view.pitch=Math.max(-1.5,Math.min(1.5,view.pitch+dy*.007));dirty=true;}if(p.button===1)pan(dx,dy);};
cv.onpointerup=e=>{const p=pointers.get(e.pointerId);if(p&&!p.moved&&p.button===0)select(e.clientX,e.clientY);pointers.delete(e.pointerId);setGesture();};cv.onpointercancel=e=>{pointers.delete(e.pointerId);setGesture();};cv.onlostpointercapture=e=>{pointers.delete(e.pointerId);setGesture();};
cv.addEventListener('wheel',e=>{e.preventDefault();view.dist=Math.max(.08,Math.min(20,view.dist*Math.exp(e.deltaY*.001)));dirty=true;},{passive:false});
let previousCanvasWidth=0;
const resize=new ResizeObserver(()=>{const width=cv.clientWidth,height=cv.clientHeight,d=Math.min(devicePixelRatio||1,renderer.mode==='canvas2d-cpu'?1:2);cv.width=Math.round(width*d);cv.height=Math.round(height*d);if(geometry&&previousCanvasWidth&&Math.abs(width-previousCanvasWidth)>1)fitSets(allSets(),true);previousCanvasWidth=width;dirty=true;});resize.observe(cv);
cv.addEventListener('webglcontextlost',e=>{e.preventDefault();setPlaying(false);status('显示中断，记录未改变',true);});
async function render(ts){
 try{
 const next=currentCase.frames[frameIndex+1],delay=next?Math.max(16,(next.time_s-currentCase.frames[frameIndex].time_s)*1000):0;
 if(playing&&ts-lastPlayback>=delay){lastPlayback=ts;if(next)await applyFrame(frameIndex+1);else setPlaying(false);}
 if(dirty&&activeGPU){renderer.begin(camera(),viewMatrix(camera()),projection(cv.width/Math.max(1,cv.height)));const inside=$('inside').checked;if(!inside)draw(activeGPU.housing);if($('showGuide').checked)draw(activeGPU.guide);if($('showRobot').checked)for(let i=0;i<activeGPU.robots.length;i++)draw(activeGPU.robots[i],1,selected===i?[.96,.75,.23]:null);draw(activeGPU.retractor,1,selected===-4?[1,.77,.21]:null);draw(activeGPU.cable,1,selected===-2?[.34,.8,.81]:null);if($('showDirectors').checked)draw(activeGPU.directors);if(inside)draw(activeGPU.housing,.12);renderer.end();drawn={frameIndex:store.current.frame_index,time_s:store.current.time_s,traceSha:BUNDLE.trace_sha256};cv.dataset.frameIndex=String(drawn.frameIndex);cv.dataset.renderedTimeS=String(drawn.time_s);cv.dataset.traceSha256=drawn.traceSha;cv.dataset.displayScope=META.scope;cv.dataset.renderer=renderer.mode;cv.dataset.renderedJointsDeg=JSON.stringify(store.current.joint_angles_deg);cv.dataset.sliderQM=String(store.current.slider_q_m);cv.dataset.rawMaxJointGapM=String(store.current.max_joint_gap_m);cv.dataset.surfaceBridgeCount=String(geometry.cable.renderOnlyJointBridges||0);cv.dataset.housingOpacity=String(inside?.12:1);cv.dataset.guideVisible=String($('showGuide').checked);cv.dataset.viewYaw=String(view.yaw);cv.dataset.viewPitch=String(view.pitch);cv.dataset.viewDistance=String(view.dist);cv.dataset.cacheUploads=String(gpuCache.stats().uploads);cv.dataset.cacheReuseHits=String(gpuCache.stats().hits);dirty=false;drawCount++;if(!ready){ready=true;for(const id of ['fit','showRobot','inside','showGuide','showDirectors','debugSegments'])$(id).disabled=false;updateReadouts(store.current);kr90LoadingUI.ready();}}requestAnimationFrame(render);
 }catch(e){setPlaying(false);status('绘制失败，记录未改变',true);kr90LoadingUI.fatal(e);}
}
window.kr90QA=()=>({schema:DATA.schema,displayScope:META.scope,actualHousingRendered:true,mode:'computed_trajectory_replay',liveSolver:false,frameIndex,frameCount:currentCase.frames.length,time_s:store.current?.time_s,traceSha:BUNDLE.trace_sha256,q:store.current?.slider_q_m,modelAngles:store.current?[...store.current.joint_angles_deg]:null,cameraUp:[0,0,1],drawn,drawCount,playing,selected,uploadCache:gpuCache.stats(),rigidCache:E.rigidCacheStats(),view:JSON.parse(JSON.stringify(view)),renderer:renderer.mode,renderStats:renderer.stats?renderer.stats():null,glError:renderer.error(),cableEdges:store.current?.edge_endpoints_root_m.length,materialRotations:store.current?.edge_material_rotations_root.length,renderOnlyJointBridges:geometry?.cable.renderOnlyJointBridges||0,segmentedDebug:$('debugSegments').checked,wholeRestLength_m:META.whole_rest_length_m,maxJointGap_m:store.current?.max_joint_gap_m,calibration:false,strictAdmission:false,interpolation:false,float64BeforeGPU:true,error:store.lastError});
$('debugSegmentsLabel').hidden=!E.validateJointSurfacePolicy(PARTITION);
$('pageMode').textContent='CAD 候选回放';$('scopeBadge').textContent='非安装验收';$('sliderLabel').textContent='H 位置示意';$('guideTag').hidden=!$('showGuide').checked;$('guideTag').textContent='解析导向假设';$('fixtureNotice').hidden=false;$('fixtureNotice').textContent='A3–A6 建模段 '+META.whole_rest_length_m.toFixed(3)+' m · '+(META.config.natural_mode==='initial_stress_free'?'CAD 初态无应力/静止':'直线无应力初态/静止')+' · 重力平衡未验证 · A6 自由摆转基线 · 内束 / H / 材料未校准 · 历史软U参数均匀全链假设，非实物标定';
await phase('构建首帧几何',startupController.signal);if(!await choose(0))throw Error('首帧构建失败，请重试');await phase('绘制首帧',startupController.signal);requestAnimationFrame(render);
})().catch(e=>{const s=document.getElementById('status');s.textContent=String(e);s.className='status stop';kr90LoadingUI.fatal(e);console.error(e);});
