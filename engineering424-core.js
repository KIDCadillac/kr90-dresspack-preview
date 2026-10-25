/* Rendering adapter only. This schema is NOT a strict accepted-state receipt. */
(function(root,factory){const K=typeof module==='object'?require('./state-core.js'):root.KR90State;const C=typeof module==='object'?require('./engineering424-cache.js'):root.KR90Engineering424Cache;const api=factory(K,C);if(typeof module==='object')module.exports=api;else root.KR90Engineering424=api;})(globalThis,function(K,C){
'use strict';
// Source424 setMaterialAxisZ/quaternion_from_z: column 2 is axial; 0/1 are cross-section directors.
const SCHEMA='KR90_ENGINEERING424_COMPUTED_TRAJECTORY_V1',finite=Number.isFinite,{add,sub,scale,dot,cross,unit}=K;
const insist=(c,m)=>{if(!c)throw Error(m);},vec=(a,n,k)=>{insist(Array.isArray(a)&&a.length===n&&a.every(finite),k+' malformed');return a;};
const near=(a,b,t=1e-9)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<=t);
const norm=a=>Math.hypot(...a),normalCache=new WeakMap(),rigidCache=C.createRigidGeometryCache(),partitionMeshes=new WeakMap();
function matrix(a,k){insist(Array.isArray(a)&&a.length===3,k+' matrix missing');a.forEach((r,i)=>vec(r,3,k+' row '+i));const c=[0,1,2].map(i=>a.map(r=>r[i]));for(let i=0;i<3;i++){insist(Math.abs(norm(c[i])-1)<1e-5,k+' nonunit basis');for(let j=i+1;j<3;j++)insist(Math.abs(dot(c[i],c[j]))<1e-5,k+' nonorthogonal basis');}insist(dot(cross(c[0],c[1]),c[2])>1-1e-5,k+' left handed basis');return{x:c[0],y:c[1],z:c[2]};}
function frameBasis(f,k){vec(f?.origin_m,3,k+' origin');return{origin_m:f.origin_m,...matrix(f.rotation,k)};}
function edgeCount(m){return m.edge_radii_m.length;}
function validateMetadata(m){
 insist(m&&typeof m==='object','metadata missing');
 insist(m.scope==='CONFIGURABLE_CAD_MANUAL_ENGINEERING_CANDIDATE','distinct CAD/manual candidate scope required');
 insist(m.calibration===false&&m.strict_admission===false&&m.installation_accepted===false,'qualification must remain uncalibrated/non-strict/not installation accepted');
 insist(m.interpolation===false,'interpolation forbidden');
 insist(m.actual_housing_collision_active===true,'actual source shell collision declaration required');
 insist(!m.ideal_guide&&m.display_scope!=='internal_open_guide_benchmark','423 synthetic fixture cannot be rendered as 424');
 insist(finite(m.whole_rest_length_m)&&m.whole_rest_length_m>0,'whole modeled rest length missing');
 insist(Array.isArray(m.edge_radii_m)&&m.edge_radii_m.length>0&&m.edge_radii_m.every(r=>finite(r)&&r>0),'exact per-edge radii required');
 insist(near(vec(m.frame_root_up,3,'root up'),[0,0,1]),'root frame must be Z up');
 for(const k of ['collision_scope','endpoint_constraint_policy'])insist(typeof m[k]==='string'&&m[k].trim().length>0,k+' missing');
 const c=m.config;insist(c&&typeof c==='object','explicit configuration required');
 insist(c.installation_claim===false&&c.manufacturer_material_calibration===false,'configuration must not assert calibration');
 insist(['straight','initial_stress_free'].includes(c.natural_mode),'explicit material natural reference required');
 for(const k of ['upstream_segments','hidden_rear_segments','front_straight_remainder_segments','front_free_segments'])insist(Number.isSafeInteger(c[k])&&c[k]>=2,k+' topology missing');
 insist(edgeCount(m)===c.upstream_segments+c.hidden_rear_segments+c.front_straight_remainder_segments+c.front_free_segments+2,'configured full modeled chain differs from radii');
 vec(c.H_root_m,3,'H root');insist(near(c.H_root_m,[0,0,0]),'only fixed root H reference supported');
 insist(finite(c.guide_front_x_m)&&c.guide_front_x_m>0,'guide front source missing');
 insist(c.mount_mode==='free_swivel_baseline_configurable_resistance','native swivel policy required');
 insist(m.model_assumptions&&Array.isArray(m.model_assumptions.conditional_manual_warnings)&&m.model_assumptions.conditional_manual_warnings.some(v=>v.includes('150mm')),'conditional bend warning missing');
 return m;
}
function validateFrame(f,m,index){
 validateMetadata(m);insist(f&&typeof f==='object','frame missing');
 insist(Number.isSafeInteger(f.frame_index)&&f.frame_index>=0&&(index===undefined||f.frame_index===index),'frame index mismatch');
 insist(finite(f.time_s)&&f.time_s>=0,'time invalid');vec(f.joint_angles_deg,6,'six joint angles');
 insist(near(f.joint_angles_deg.slice(0,3),[0,-90,90]),'424 frozen-root source mesh requires fixed A1-A3');
 insist(f.prescribed_fk_root_m&&typeof f.prescribed_fk_root_m==='object','prescribed FK missing');for(const k of ['A3','A4','A5','A6'])frameBasis(f.prescribed_fk_root_m[k],'FK '+k);
 const e=f.edge_endpoints_root_m,r=f.edge_material_rotations_root,p=f.cable_points_root_m;
 insist(Array.isArray(e)&&e.length===edgeCount(m),'full edge chain required');insist(Array.isArray(r)&&r.length===e.length,'material rotations required for every edge');
 insist(Array.isArray(p)&&p.length===e.length+1,'full selected point chain required');p.forEach((v,i)=>vec(v,3,'point '+i));
 e.forEach((v,i)=>{insist(Array.isArray(v)&&v.length===2,'edge endpoint pair missing');vec(v[0],3,'edge start');vec(v[1],3,'edge end');insist(norm(sub(v[1],v[0]))>1e-10,'zero-length edge');const basis=matrix(r[i],'material rotation '+i);insist(dot(unit(sub(v[1],v[0])),basis.z)>1-1e-5,'native material +Z axis/ports mismatch');});
 insist(near(p[0],e[0][0])&&near(p[p.length-1],e[e.length-1][1]),'endpoint selection mismatch');
 for(let i=1;i<p.length-1;i++)insist(near(p[i],e[i-1][1])||near(p[i],e[i][0]),'invented point between joint ports');
 insist(finite(f.slider_q_m)&&finite(f.slider_qdot_m_s),'slider state missing');
 insist(Array.isArray(f.joint_gaps)&&f.joint_gaps.length===e.length-1,'all joint gap records required');
 let maximum=0;f.joint_gaps.forEach((g,i)=>{insist(g.node===i+1,'joint gap order mismatch');vec(g.incoming_root_m,3,'incoming port');vec(g.outgoing_root_m,3,'outgoing port');insist(near(g.incoming_root_m,e[i][1])&&near(g.outgoing_root_m,e[i+1][0]),'joint ports mismatch');const d=norm(sub(g.incoming_root_m,g.outgoing_root_m));insist(finite(g.gap_m)&&Math.abs(d-g.gap_m)<1e-9,'joint gap mismatch');maximum=Math.max(maximum,d);});
 insist(finite(f.max_joint_gap_m)&&Math.abs(f.max_joint_gap_m-maximum)<1e-9,'max joint gap mismatch');
 insist(f.diagnostics&&typeof f.diagnostics==='object'&&!Array.isArray(f.diagnostics),'contact/friction diagnostics missing');
 for(const k of ['contact','friction'])insist(f.diagnostics[k]&&typeof f.diagnostics[k]==='object',k+' diagnostics missing');
 const bend=f.diagnostics.bend;insist(bend&&finite(bend.min_discrete_radius_m)&&bend.min_discrete_radius_m>0&&Number.isSafeInteger(bend.joints_below_conditional_150mm)&&bend.joints_below_conditional_150mm>=0,'source bend diagnostics required');
 const a=f.A6_attachment;insist(a&&a.cable_orientation_prescribed===false,'dynamic native A6 attachment required');
 vec(a.actual_cable_endpoint_root_m,3,'native A6 endpoint');vec(a.prescribed_socket_root_m,3,'A6 socket');matrix(a.actual_terminal_material_rotation_root,'native terminal rotation');
 insist(near(a.actual_cable_endpoint_root_m,e.at(-1)[1]),'A6 endpoint differs from native cable');
 for(let j=0;j<3;j++)insist(near(a.actual_terminal_material_rotation_root[j],r.at(-1)[j]),'terminal material frame mismatch');
 insist(finite(a.native_ball_joint_gap_m)&&Math.abs(a.native_ball_joint_gap_m-norm(sub(a.actual_cable_endpoint_root_m,a.prescribed_socket_root_m)))<1e-9,'A6 gap mismatch');
 return f;
}
function validateTrace(t){insist(t?.schema===SCHEMA,'distinct engineering424 schema required');validateMetadata(t.metadata);insist(Array.isArray(t.frames)&&t.frames.length>0,'recorded frames missing');let last=-Infinity;for(let i=0;i<t.frames.length;i++){validateFrame(t.frames[i],t.metadata,i);insist(t.frames[i].time_s>last,'nonmonotonic recorded time');last=t.frames[i].time_s;}return t;}
function transformedGeometry(g,b,unitScale=1,color){
 const p=new Float64Array(g.verts.length),n=new Float64Array(p.length),c=new Float64Array(p.length/3*4);let ln=g.normals;if(!ln){ln=normalCache.get(g);if(!ln){ln=K.normals(g.verts,g.tris);normalCache.set(g,ln);}}
 for(let j=0;j<p.length;j+=3){p.set(K.transform(b,g.verts.slice(j,j+3).map(x=>x*unitScale)),j);n.set(K.rotate(b,Array.from(ln.slice(j,j+3))),j);c.set(color?[...color,1]:g.colors?g.colors.slice(j/3*4,j/3*4+4):[...g.color.slice(0,3),1],j/3*4);}return{p,n,c,idx:new Uint32Array(g.tris),node:g.frame_node};
}
function cachedTransform(g,b,unitScale=1,color){return rigidCache.get(g,[...b.origin_m,...b.x,...b.y,...b.z,unitScale,color?1:0,...(color||[])],()=>transformedGeometry(g,b,unitScale,color));}
function partitionedHousing(mesh,policy){let map=partitionMeshes.get(mesh.housing);if(!map){map=new WeakMap();partitionMeshes.set(mesh.housing,map);}let g=map.get(policy);if(!g){g={...mesh.housing,tris:retainedHousingIds(policy).flatMap(i=>mesh.housing.tris.slice(i*3,i*3+3))};map.set(policy,g);}return g;}
const identity=()=>({origin_m:[0,0,0],x:[1,0,0],y:[0,1,0],z:[0,0,1]});
function directorGeometry(edges){const p=[],n=[],c=[],idx=[];for(const e of edges){const a=scale(add(e.a,e.b),.5);for(const [axis,color]of[['x',[.82,.22,.18,1]],['y',[.18,.60,.37,1]],['z',[.17,.39,.83,1]]]){idx.push(p.length/3,p.length/3+1);p.push(...a,...add(a,scale(e[axis],.045)));n.push(0,1,0,0,1,0);c.push(...color,...color);}}return{p:new Float64Array(p),n:new Float64Array(n),c:new Float64Array(c),idx:new Uint32Array(idx)};}
function guideGeometry(guide,atQ){
 const p=[],n=[],c=[],idx=[],ends=atQ===undefined?guide.axis_endpoints_root_m:[[atQ,0,0]],radius=guide.inner_radius_m,color=atQ===undefined?[.53,.32,.71,1]:[.98,.60,.16,1],sides=48;
 for(const end of ends)for(let j=0;j<sides;j++){const theta=j*2*Math.PI/sides;p.push(end[0],end[1]+radius*Math.cos(theta),end[2]+radius*Math.sin(theta));n.push(0,1,0);c.push(...color);}
 for(let ring=0;ring<ends.length;ring++)for(let j=0;j<sides;j++)idx.push(ring*sides+j,ring*sides+(j+1)%sides);
 if(ends.length===2)for(let j=0;j<sides;j+=12)idx.push(j,sides+j);
 return{p:new Float64Array(p),n:new Float64Array(n),c:new Float64Array(c),idx:new Uint32Array(idx),mode:'lines',symbolic:atQ!==undefined};
}
function cableGeometry(edges,m){
 if(!m.edge_radii_m)return K.tubeGeometry(edges,m.cable_radius_m,[.06,.59,.64],20);
 // Exact per-material radii. No averaging or invented taper at radius changes.
 const vertices=edges.length*42,p=new Float64Array(vertices*3),n=new Float64Array(vertices*3),c=new Float64Array(vertices*4),idx=new Uint32Array(edges.length*120);
 edges.forEach((edge,i)=>{const g=K.tubeGeometry([edge],m.edge_radii_m[i],[.06,.59,.64],20);p.set(g.p,i*126);n.set(g.n,i*126);c.set(g.c,i*168);for(let j=0;j<g.idx.length;j++)idx[i*120+j]=g.idx[j]+i*42;});return{p,n,c,idx};
}
// Display-only seam surface: triangles reuse two recorded end rings verbatim.
// This changes no native state, gap, radius, material orientation or collider.
function bridgeJointRings(g,edgeCount){
 const idx=new Uint32Array(g.idx.length+Math.max(0,edgeCount-1)*120);idx.set(g.idx);let k=g.idx.length;
 for(let edge=0;edge<edgeCount-1;edge++)for(let sector=0;sector<20;sector++){
  const a=edge*42+21+sector,b=(edge+1)*42+sector;idx.set([a,b,a+1,a+1,b,b+1],k);k+=6;
 }
 return{...g,idx,nativeIndexCount:g.idx.length,renderOnlyJointBridges:Math.max(0,edgeCount-1)};
}
function validateJointSurfacePolicy(p){
 const s=p.joint_surface_bridge_policy;if(s===undefined)return false;
 insist(s.allowed===true&&s.new_vertices_allowed===false&&s.modify_raw_ports_or_directors===false&&s.modify_raw_trace===false&&s.modify_collision_or_physics===false&&s.preserve_and_display_raw_joint_gap_diagnostics===true&&s.segmented_debug_view_available===true,'render-only joint surface policy invalid');return true;
}
function retainedHousingIds(p){const r=p.render_source_surface_replacements,ports=r.declared_analytic_port_interface_substitutions,omit=new Set([...r.replaced_dynamic_U_skin,...ports.rear_unknown_annular_faces,...ports.front_filled_display_closure]);return Array.from({length:18105},(_,i)=>i).filter(i=>!omit.has(i));}
function validateHousingPartition(p,mesh,m){
 insist(p?.schema==='KR90424_COMPUTED_RENDER_POLICY_V1'&&p.calibration===false&&p.installation_accepted===false&&p.strict_admission===false&&p.interpolation===false,'424 source render policy required');
 const pins=p.source_pins;insist(Array.isArray(pins),'policy source pins missing');for(const digest of ['eae6c7a1f2befbb087eca327a5f36c102656e79e7c0986982191d46e8d957b8b','19e05649ccfe69d03a17308d7e89d71d38a7ac75b3f0614508be3debcff77ab1','5c202ef5860432ca4dcc7b17d952c832ba2feb435709d52a906dafd3f6b934bb'])insist(pins.some(x=>x.sha256===digest),'unreviewed housing source partition');
 insist(mesh.housing.tris.length/3===18105&&mesh.housing.verts.length/3===18725,'housing partition mesh dimensions mismatch');
 const r=p.render_source_surface_replacements;insist(r&&r.active_source_faces===15591,'explicit 424 source surface partition required');
 const u=r.replaced_dynamic_U_skin,ports=r.declared_analytic_port_interface_substitutions;
 insist(Array.isArray(u)&&near(u,Array.from({length:2468},(_,i)=>3389+i),0),'exact flexible U skin replacement required');
 insist(ports&&Array.isArray(ports.rear_unknown_annular_faces)&&Array.isArray(ports.front_filled_display_closure)&&near(ports.rear_unknown_annular_faces,Array.from({length:32},(_,i)=>7367+i),0)&&near(ports.front_filled_display_closure,Array.from({length:14},(_,i)=>7399+i),0),'exact source port substitutions required');
 const keep=retainedHousingIds(p);insist(keep.length===15591&&keep.includes(573),'rigid shell retention invalid');
 insist(Array.isArray(r.upper_fixed_connected_interface_faces)&&r.upper_fixed_connected_interface_faces.length===36&&r.upper_fixed_connected_interface_faces.every(i=>keep.includes(i)),'upper interfaces must stay visible');
 const g=p.analytic_guide;insist(g&&Array.isArray(g.axis_endpoints_root_m)&&g.axis_endpoints_root_m.length===2,'declared 424 analytic guide missing');const [a,b]=g.axis_endpoints_root_m;vec(a,3,'guide entry');vec(b,3,'guide exit');insist(a[0]<0&&near(a.slice(1),[0,0])&&near(b,[m.config.guide_front_x_m,0,0])&&finite(g.inner_radius_m)&&g.inner_radius_m>Math.max(...m.edge_radii_m),'guide/config source mismatch');
 insist(p.render_original_slider_CAD===false&&p.render_housing===true&&p.render_hidden_material===true&&near(vec(p.fixed_a123_deg,3,'fixed root axes'),[0,-90,90]),'explicit shell and symbolic H policy required');
 insist(p.bend?.warning_threshold_m===.15&&p.bend.conditional_article_applicability===true&&p.bend.report_actual_overbend_without_shape_projection===true,'conditional bend warning policy required');return p;
}
function buildGeometry(f,mesh,m,partition,options={}){
 validateFrame(f,m);validateHousingPartition(partition,mesh,m);
 const robots=mesh.robot_groups.map(g=>cachedTransform(g,frameBasis(f.prescribed_fk_root_m[g.frame_node],'FK '+g.frame_node),.001));
 const housingMesh=partitionedHousing(mesh,partition);
 const housing=cachedTransform(housingMesh,identity());
 // This is the current model's declared analytic guide, not old 423 hardware.
 const sourceGuide=partition.analytic_guide;
 const guide=rigidCache.get(sourceGuide,[...sourceGuide.axis_endpoints_root_m.flat(),sourceGuide.inner_radius_m],()=>guideGeometry(sourceGuide)),retractor=guideGeometry(sourceGuide,f.slider_q_m);
 const edges=f.edge_endpoints_root_m.map((e,i)=>({a:e[0],b:e[1],...matrix(f.edge_material_rotations_root[i],'director')}));
 const nativeCable=cableGeometry(edges,m),bridgeAllowed=validateJointSurfacePolicy(partition),cable=bridgeAllowed&&!options.segmented?bridgeJointRings(nativeCable,edges.length):nativeCable,directors=directorGeometry(edges);
 for(const g of [housing,guide,retractor,cable,directors,...robots])for(const a of [g.p,g.n,g.c])insist(a.every(finite),'nonfinite rendered geometry');
 return{robots,housing,guide,retractor,cable,directors};
}
class AtomicStore{constructor(metadata){this.metadata=metadata;this.request=0;this.current=null;this.geometry=null;this.lastError=null;}begin(){return ++this.request;}commit(f,g,ticket){if(ticket!==this.request)return{ok:false,reason:'stale'};try{validateFrame(f,this.metadata);insist(g,'geometry missing');}catch(e){return this.reject(e,ticket);}this.current=f;this.geometry=g;this.lastError=null;return{ok:true};}reject(e,ticket){if(ticket===this.request)this.lastError=String(e);return{ok:false,reason:String(e)};}}
return{SCHEMA,edgeCount,rigidCacheStats:()=>rigidCache.stats(),bridgeJointRings,validateJointSurfacePolicy,retainedHousingIds,validateHousingPartition,validateMetadata,validateFrame,validateTrace,buildGeometry,AtomicStore,matrix,frameBasis};
});
