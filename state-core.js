/* Derived renderer math from source308. Pure Float64 geometry until GPU upload. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.KR90State=api;})(globalThis,function(){
'use strict';
const finite=Number.isFinite, arr=(a,n,name)=>{if(!Array.isArray(a)||a.length!==n||!a.every(finite))throw Error(name+' is malformed');return a;};
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>scale(a,1/(Math.hypot(...a)||1));
function assert(c,m){if(!c)throw Error(m);}
function near(a,b,t=1e-12){return a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<=t);}
function basis(b,name){for(const k of ['x','y','z'])arr(b[k],3,name+'.'+k);for(const k of ['x','y','z'])assert(Math.abs(dot(b[k],b[k])-1)<1e-6,name+' basis norm');assert(Math.abs(dot(b.x,b.y))<1e-6&&Math.abs(dot(b.y,b.z))<1e-6&&Math.abs(dot(b.x,b.z))<1e-6,name+' basis orthogonality');}
function validateFrame(f,manifest){
 assert(f&&typeof f==='object','Missing frame');
 const moving=f.schema==='KR90_MOVING383_STATE_FRAME/1';
 assert(moving||f.schema==='KR90_ACTUAL_STATE_FRAME/1','Unknown frame schema');
 assert(Number.isSafeInteger(f.generation)&&f.generation>=0,'Generation invalid');
 assert(finite(f.time_s)&&f.time_s>=0,'Time invalid');arr(f.pose_deg,3,'pose_deg');
 assert(finite(f.slide_m)&&finite(f.slide_velocity_m_s),'q/v invalid');
 assert(/^[a-f0-9]{64}$/.test(f.accepted_packet_sha256),'Source identity missing');
 assert(f.receipt&&f.receipt.status==='accepted'&&f.receipt.generation===f.generation&&f.receipt.time_s===f.time_s&&f.receipt.full_word_commit_join===true,'Not an accepted receipt');
 if(moving){
  assert(f.receipt.discrete_energy_momentum_gates===(f.generation>0)&&f.receipt.full_physics===false&&f.receipt.temporal_accuracy===false&&f.receipt.device_calibrated===false,'Moving receipt qualification mismatch');
  const q=f.qualification;assert(q&&q.synthetic===true&&q.material_calibrated===false&&q.device_calibrated===false&&q.discrete_energy_momentum_gates===true&&q.temporal_accuracy===false&&q.full_physics===false&&q.real_time===false,'Moving scope mismatch');
  arr(f.native_identity,5,'native identity');assert(f.native_identity.every(Number.isSafeInteger)&&f.native_identity[0]===f.generation,'Moving phase mismatch');
  assert(/^[a-f0-9]{64}$/.test(f.source_bundle_sha256)&&f.source_bundle_sha256===f.config_id,'Moving source bundle mismatch');
  for(const [k,n]of [['state/canonical/hi_words',872],['state/canonical/lo_words',872],['state/boundary/hi_words',6],['state/boundary/lo_words',6]])assert(Array.isArray(f.primary_words_hex?.[k])&&f.primary_words_hex[k].length===n&&f.primary_words_hex[k].every(w=>/^[0-9a-f]{16}$/.test(w)),'Moving full primary words required');
  assert(Number.isSafeInteger(f.primary_mapping_rail_index)&&f.primary_mapping_rail_index>=0&&f.primary_mapping_rail_index<436,'Moving rail mapping');
  assert(f.exact_time&&JSON.stringify(f.exact_time)===JSON.stringify(f.receipt.exact_time)&&JSON.stringify(f.exact_time)===JSON.stringify(f.cohort.exact_time),'Moving exact clock mismatch');
  const et=f.exact_time;assert(typeof et.numerator==='string'&&/^\d+$/.test(et.numerator)&&typeof et.denominator==='string'&&/^[1-9]\d*$/.test(et.denominator),'Moving rational clock malformed');
  assert(BigInt(et.numerator)*1152921504606846976n===BigInt(f.generation)*4803839602528529n*BigInt(et.denominator)&&f.time_s===Number(et.numerator)/Number(et.denominator),'Moving original clock mismatch');
  const phase=f.source371_phase;assert(phase&&phase.knot===f.generation&&phase.side==='left'&&phase.interval===f.generation-1&&JSON.stringify(phase.time_exact)===JSON.stringify(et),'Moving source phase mismatch');
  const r=f.physical_readout;assert(r&&finite(r.H_half_kinetic_energy_J)&&r.H_internal_interface_work_J===null,'H work scope mismatch');
  arr(f.cohort.H_velocity_m_s,3,'H velocity');assert(near(f.cohort.H_velocity_m_s,[f.slide_velocity_m_s,0,0]),'Mixed H velocity');
  arr(f.retractor_translation_m,3,'rail translation');assert(near(f.retractor_translation_m,[f.slide_m,0,0]),'Mixed rail translation');
  if(f.generation>0){for(const key of ['current_macro','cumulative']){const w=f.work?.[key];assert(w&&finite(w.drive_work_J)&&finite(w.damping_work_J)&&w.all_source_bridges_uncredited===true&&finite(w.energy_ratio)&&w.energy_ratio<=1&&w.momentum_ratios.length===6&&w.momentum_ratios.every(x=>finite(x)&&x<=1),'Moving work/ledger qualification');}}
 }else assert(f.receipt.whole_energy_gate===false&&f.receipt.full_physics===false,'Receipt qualification mismatch');
 const c=f.cohort;assert(c&&c.native_generation===f.generation&&c.upstream_generation===f.generation&&c.boundary_generation===f.generation,'Mixed generation');
 assert(c.q_m===f.slide_m,'Mixed q');arr(c.H_m,3,'H');
 assert(c.native_time_s===f.time_s&&c.upstream_time_s===f.time_s&&c.receipt_generation===f.generation,'Mixed time/receipt');
 assert(c.config_id===f.config_id&&f.upstream.config_id===f.config_id,'Mixed configuration');
 assert(Array.isArray(f.native_bodies)&&f.native_bodies.length===72,'72 native bodies required');
 const ids=new Set();for(const b of f.native_bodies){assert(Number.isSafeInteger(b.id)&&b.id>=0&&b.id<72&&!ids.has(b.id),'Native body identity');ids.add(b.id);arr(b.center_m,3,'Native center');arr(b.quaternion_xyzw,4,'Native quaternion');}
 assert(f.node_frames_si&&Object.keys(f.node_frames_si).length,'Robot frames absent');for(const [k,b] of Object.entries(f.node_frames_si)){arr(b.origin_m,3,k+'.origin');basis(b,k);}
 assert(Array.isArray(f.rods)&&f.rods.length>0,'Native rods absent');for(const r of f.rods){arr(r.a,3,'rod a');arr(r.b,3,'rod b');basis(r,'native rod');}
 const u=f.upstream;assert(u&&u.generation===f.generation,'Upstream generation');assert(Array.isArray(u.nodes)&&u.nodes.length===7,'Seven material nodes required');u.nodes.forEach((n,i)=>arr(n,3,'U node '+i));
 assert(Array.isArray(u.directors_wxyz)&&u.directors_wxyz.length===6,'Six material directors required');u.directors_wxyz.forEach(d=>arr(d,4,'U quaternion'));
 assert(Array.isArray(u.edges)&&u.edges.length===6,'Six U edges required');for(let i=0;i<6;i++){const e=u.edges[i];arr(e.a,3,'U a');arr(e.b,3,'U b');basis(e,'U director');assert(near(e.a,u.nodes[i])&&near(e.b,u.nodes[i+1]),'Mixed U edge/node geometry');}
 assert(near(u.nodes[6],c.H_m),'U/native H mismatch');
 if(manifest){assert(f.session_id===manifest.session_id,'Session mismatch');assert(f.config_id===manifest.config_id,'Configuration mismatch');}
 return f;
}
function rotate(b,v){return v.map((_,i)=>b.x[i]*v[0]+b.y[i]*v[1]+b.z[i]*v[2]);}
function transform(b,v){return add(b.origin_m,rotate(b,v));}
function normals(p,idx){const n=new Float64Array(p.length);for(let k=0;k<idx.length;k+=3){const a=p.slice(idx[k]*3,idx[k]*3+3),b=p.slice(idx[k+1]*3,idx[k+1]*3+3),c=p.slice(idx[k+2]*3,idx[k+2]*3+3),nn=cross(sub(Array.from(b),Array.from(a)),sub(Array.from(c),Array.from(a)));for(let j=0;j<3;j++)for(let q=0;q<3;q++)n[idx[k+j]*3+q]+=nn[q];}for(let k=0;k<n.length;k+=3)n.set(unit(Array.from(n.slice(k,k+3))),k);return n;}
function tubeGeometry(edges,radius,color,sides=20){
 assert(finite(radius)&&radius>0,'Tube radius invalid');const p=new Float64Array(edges.length*2*(sides+1)*3),n=new Float64Array(p.length),c=new Float64Array(p.length/3*4),idx=[];
 for(let s=0;s<edges.length;s++){const e=edges[s];for(let end=0;end<2;end++)for(let j=0;j<=sides;j++){const theta=2*Math.PI*j/sides,nn=add(scale(e.x,Math.cos(theta)),scale(e.y,Math.sin(theta))),v=add(end?e.b:e.a,scale(nn,radius)),k=(s*2*(sides+1)+end*(sides+1)+j);p.set(v,k*3);n.set(nn,k*3);c.set(j<2?[.97,.74,.29,1]:[...color,1],k*4);}for(let j=0;j<sides;j++){const a=s*2*(sides+1)+j,b=a+sides+1;idx.push(a,b,a+1,a+1,b,b+1);}}
 return{p,n,c,idx:new Uint32Array(idx)};
}
function buildGeometry(f,mesh,config){
 validateFrame(f);const robots=mesh.robot_groups.map(g=>{const b=f.node_frames_si[g.frame_node];assert(b,'Missing robot frame '+g.frame_node);const p=new Float64Array(g.verts.length),n=new Float64Array(g.verts.length),ln=normals(g.verts,g.tris),c=new Float64Array(p.length/3*4);for(let j=0;j<g.verts.length;j+=3){p.set(transform(b,g.verts.slice(j,j+3).map(x=>x*.001)),j);n.set(rotate(b,Array.from(ln.slice(j,j+3))),j);c.set([...g.color.slice(0,3),1],j/3*4);}return{p,n,c,idx:new Uint32Array(g.tris),node:g.frame_node,source:g};});
 const ret=mesh.retractor,retractor=ret?{p:new Float64Array(ret.verts.map((v,i)=>v+(f.retractor_translation_m?f.retractor_translation_m[i%3]:(i%3===0?f.slide_m:0)))),n:new Float64Array(ret.normals),c:new Float64Array(ret.colors.map((v,i)=>i%4===3?1:[.98,.60,.16][i%4])),idx:new Uint32Array(ret.tris)}:null;
 const native=tubeGeometry(f.rods,config.tube_radius_m,[.06,.59,.64]),upstream=tubeGeometry(f.upstream.edges,config.upstream_radius_m,[.40,.32,.78]);
 for(const b of [...robots,native,upstream,...(retractor?[retractor]:[])])assert([...b.p,...b.n,...b.c].every(finite),'Nonfinite geometry');
 return{robots,retractor,native,upstream};
}
class AtomicStore{
 constructor(manifest){this.manifest=manifest;this.current=null;this.geometry=null;this.request=0;this.lastError=null;}
 begin(){return ++this.request;}
 commit(f,geometry,ticket,options={}){if(ticket!==this.request)return{ok:false,reason:'stale'};try{validateFrame(f,this.manifest);assert(geometry,'Geometry missing');if(this.current&&!options.seek&&f.generation<=this.current.generation)throw Error('stale generation');}catch(e){this.lastError=String(e);return{ok:false,reason:this.lastError};}this.current=f;this.geometry=geometry;this.lastError=null;return{ok:true};}
 reject(reason,ticket){if(ticket===this.request)this.lastError=String(reason);return{ok:false,reason:String(reason)};}
}
return{validateFrame,buildGeometry,tubeGeometry,AtomicStore,transform,rotate,normals,add,sub,scale,dot,cross,unit,near};
});
