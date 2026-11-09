import * as THREE from 'three';
import { createMascot } from '../../web/mascot.js';

export const palette = { white:'#ffffff',green:'#0d6731',mint:'#8cf2a6',lime:'#d1f441',purple:'#8534f3',lilac:'#c898fd',pink:'#ff80d2',yellow:'#ffe777',paper:'#f4f7f3' };
const ease = (t,a,b) => { const x=Math.max(0,Math.min(1,(t-a)/(b-a)));return x*x*(3-2*x); };
const axisY = new THREE.Vector3(0,1,0);

function solid(parent,name,geometry,color,position=[0,0,0],scale=[1,1,1]) {
  const material=new THREE.MeshStandardMaterial({color:palette[color]||color,roughness:.64,metalness:0});
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.position.set(...position);mesh.scale.set(...scale);parent.add(mesh);return mesh;
}
function group(parent,name,position=[0,0,0]) {const item=new THREE.Group();item.name=name;item.position.set(...position);parent.add(item);return item;}
function ball(parent,name,color,position,scale) {return solid(parent,name,new THREE.SphereGeometry(1,20,14),color,position,scale);}
function roundedBox(parent,name,w,h,d,color,position=[0,0,0]) {
  const r=Math.min(w,h)*.13,s=new THREE.Shape();
  s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);
  s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);
  s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
  return solid(parent,name,new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelSize:.045,bevelThickness:.045,bevelSegments:3,curveSegments:6}),color,position);
}
function label(parent,text,w,h,position=[0,0,.3]) {
  let map=null;
  if(typeof document!=='undefined') {
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;
    const ctx=canvas.getContext('2d');ctx.fillStyle=palette.green;ctx.font='600 64px "Mona Sans", Arial';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(text,384,96,740);map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  }
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false}));
  mesh.name='Label.'+text;mesh.position.set(...position);parent.add(mesh);return mesh;
}
function bone(parent,name,radius) {return solid(parent,name,new THREE.CylinderGeometry(radius,radius,1,10),'lilac');}
function alignBone(mesh,a,b) {
  const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.clone().sub(from);
  mesh.position.copy(from.add(to).multiplyScalar(.5));mesh.scale.y=delta.length();mesh.quaternion.setFromUnitVectors(axisY,delta.normalize());
  mesh.userData.ends=[a,b];
}

function hand(parent,name,{mirror=false,scale=.7,color='lilac'}={}) {
  const root=group(parent,name);root.scale.set(mirror?-scale:scale,scale,scale);
  ball(root,'Palm',color,[0,-.02,0],[.45,.48,.21]);
  const wrist=solid(root,'Wrist',new THREE.CapsuleGeometry(.18,.36,5,12),color,[0,-.56,-.04]);
  const fingers=Array.from({length:5},(_,i)=>{
    const parts={a:bone(root,`Finger.${i}.Bone.0`,i===4?.085:.07),b:bone(root,`Finger.${i}.Bone.1`,i===4?.075:.063),mid:ball(root,`Finger.${i}.Mid`,color,[0,0,0],[.075,.075,.075]),tip:ball(root,i===0?'IndexTip':i===4?'ThumbTip':`Finger.${i}.Tip`,color,[0,0,0],[.067,.067,.067])};
    parts.a.material.color.set(palette[color]);parts.b.material.color.set(palette[color]);return parts;
  });
  const result={group:root,fingers,indexTip:fingers[0].tip,thumbTip:fingers[4].tip,wrist};setHand(result,'open');return result;
}
export function setHand(item,pose,gap=0) {
  const xs=[-.27,-.08,.12,.3],lengths=[.73,.86,.78,.61];
  const extended=pose==='open'?[1,1,1,1]:pose==='peace'?[1,1,0,0]:['point','l','pinch'].includes(pose)?[1,0,0,0]:[0,0,0,0];
  const pinch=pose==='pinch',relaxed=pose==='relaxed';
  item.group.userData.pose=pose;
  item.fingers.forEach((part,i)=>{
    let base,mid,tip;
    if(i<4) {
      base=[xs[i],.25,0];
      mid=extended[i]?[xs[i],.25+lengths[i]*.52,.01]:[xs[i],relaxed?.56:.4,.25];
      tip=extended[i]?[xs[i]+(pose==='peace'?(i===0?-.13:i===1?.13:0):0),.25+lengths[i],.03]:[xs[i],relaxed?.25:.02,relaxed?.37:.32];
      if(pinch&&i===0){mid=[-.45,.65,.07];tip=[-.52+gap,.78,.14];}
    } else {
      base=[-.36,-.12,.04];mid=['open','l'].includes(pose)?[-.65,.18,.07]:[-.48,.2,.31];
      tip=['open','l'].includes(pose)?[-.98,.25,.06]:[-.1,.25,.36];
      if(pinch){mid=[-.72,.4,.1];tip=[-.52-gap,.78,.14];}
    }
    alignBone(part.a,base,mid);alignBone(part.b,mid,tip);part.mid.position.set(...mid);part.tip.position.set(...tip);
  });
}
function placeTip(item,target) {
  const offset=item.indexTip.position.clone().multiply(item.group.scale).applyEuler(item.group.rotation);
  item.group.position.set(...target).sub(offset);
}
function stroke(parent,name,color='purple') {
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(-1.5,-.18,.42),new THREE.Vector3(-.65,.48,.42),new THREE.Vector3(.2,-.3,.42),new THREE.Vector3(1.4,.28,.42)]);
  const mesh=solid(parent,name,new THREE.TubeGeometry(curve,64,.045,8,false),color);return {mesh,curve,total:mesh.geometry.index.count};
}
function ring(parent,name,radius,color,position=[0,0,.4]) {return solid(parent,name,new THREE.TorusGeometry(radius,.035,8,64),color,position);}

function photoTexture(effect='clear',pose=0) {
  if(typeof document==='undefined')return null;
  const source=document.createElement('canvas');source.width=400;source.height=280;const ctx=source.getContext('2d');
  ctx.fillStyle='#dff6e5';ctx.fillRect(0,0,400,280);
  ctx.fillStyle=palette.lilac;ctx.beginPath();ctx.arc(70,65,40,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=palette.yellow;ctx.fillRect(285,175,100,70);
  const points=[[80,12],[98,39],[130,32],[128,65],[150,85],[121,101],[118,134],[87,123],[61,145],[47,115],[15,109],[29,79],[15,50],[47,46],[58,17],[80,31]];
  ctx.save();ctx.translate(112,40);ctx.rotate((pose-1)*.07);ctx.scale(1.2,1.2);ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=palette.lime;ctx.fill();
  ctx.fillStyle=palette.green;for(const x of [64,94]){ctx.beginPath();ctx.ellipse(x,73,4,pose===1?4:7,0,0,Math.PI*2);ctx.fill();}
  ctx.lineWidth=4;ctx.strokeStyle=palette.green;ctx.beginPath();ctx.arc(79,91,15,0,Math.PI);ctx.stroke();ctx.restore();
  const output=document.createElement('canvas');output.width=400;output.height=280;const out=output.getContext('2d');
  if(effect==='mosaic'){const small=document.createElement('canvas');small.width=18;small.height=13;small.getContext('2d').drawImage(source,0,0,18,13);out.imageSmoothingEnabled=false;out.drawImage(small,0,0,400,280);}
  else {out.filter=effect==='blur'?'blur(10px)':'none';out.drawImage(source,0,0);}
  const map=new THREE.CanvasTexture(output);map.colorSpace=THREE.SRGBColorSpace;return map;
}
function picture(parent,name,w=4,h=2.7,pose=0) {
  const root=group(parent,name);roundedBox(root,'Picture.Frame',w+.18,h+.18,.12,'white',[0,0,-.12]);
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:photoTexture('clear',pose),color:0xffffff}));mesh.name='Picture.Image';mesh.position.z=.09;root.add(mesh);return {group:root,mesh,w,h};
}
function polygon(parent,effect) {
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(12),3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(8),2));geometry.setIndex([0,1,2,0,2,3]);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:photoTexture(effect),side:THREE.DoubleSide}));mesh.name='Fingertip.Effect';parent.add(mesh);return mesh;
}
function wire(parent,name,color='purple') {return Array.from({length:4},(_,i)=>solid(parent,`${name}.${i}`,new THREE.CylinderGeometry(.025,.025,1,8),color));}
function rectangle(edges,a,b,z=.4) {const points=[[a[0],a[1],z],[b[0],a[1],z],[b[0],b[1],z],[a[0],b[1],z]];edges.forEach((edge,i)=>alignBone(edge,points[i],points[(i+1)%4]));}

export function createTutorialScene(mode) {
  const root=new THREE.Group();root.name='Tutorial.'+mode;
  const guide=createMascot(THREE,name=>palette[name]);guide.group.name='Guide';guide.group.position.set(-3.35,-.05,.1);guide.group.scale.setScalar(.78);root.add(guide.group);
  solid(root,'Stage.Plinth',new THREE.CylinderGeometry(5.2,5.3,.18,64),'paper',[0,-1.85,-.4]);
  solid(root,'Stage.GuideBase',new THREE.CylinderGeometry(1.55,1.6,.1,48),'mint',[-3.35,-1.7,0]);
  const chapters=Array.from({length:4},(_,i)=>group(root,'Chapter.'+i,[1.6,.1,0]));
  const lessons=chapters.map((chapter,c)=>{
    const state={group:chapter,hands:[]};
    if(mode==='menu') {
      if(c===0)state.tiles=['Efek','Painting','Foto','Meme'].map((text,i)=>{const item=group(chapter,'Mode.'+i,[(i%2-.5)*2.25,(.5-Math.floor(i/2))*1.15,0]);roundedBox(item,'Tile',2,.86,.2,['mint','lilac','pink','yellow'][i]);label(item,text,1.7,.38,[0,0,.26]);return item;});
      if(c===1){roundedBox(chapter,'Dwell.Button',2.8,1.25,.23,'mint');label(chapter,'0,8 detik',2,.4,[0,.08,.28]);state.progress=ring(chapter,'Dwell.Progress',.73,'green',[0,.05,.35]);state.hands=[hand(chapter,'Point',{scale:.78})];}
      if(c===2){state.drawer=group(chapter,'Tools.Drawer');roundedBox(state.drawer,'Panel',2.5,2.65,.22,'white');label(state.drawer,'Alat',1.2,.36,[0,.92,.28]);for(let i=0;i<3;i++)roundedBox(state.drawer,'Setting.'+i,1.8,.29,.08,['mint','lilac','yellow'][i],[0,.34-i*.55,.29]);const close=group(state.drawer,'Close',[.89,.97,.33]);for(const z of [-Math.PI/4,Math.PI/4]){const bar=solid(close,'X',new THREE.CapsuleGeometry(.025,.24,4,8),'green');bar.rotation.z=z;}const icon=group(chapter,'Tools.Icon',[1.9,0,.25]);roundedBox(icon,'Button',.7,.9,.15,'mint');for(const y of [-.16,.16]){const bar=solid(icon,'Slider',new THREE.CapsuleGeometry(.025,.35,4,8),'green',[0,y,.2]);bar.rotation.z=Math.PI/2;ball(icon,'Knob','green',[y,y,.23],[.07,.07,.07]);}}
      if(c===3){state.key=group(chapter,'Key.S',[-1.4,0,.4]);roundedBox(state.key,'Key',1.1,1.1,.35,'lilac');label(state.key,'S',.7,.7,[0,0,.41]);state.preview=picture(chapter,'Preview',2.1,1.5);state.preview.group.position.set(1,.12,.1);label(chapter,'Preview Photo',2.9,.38,[.8,-1.12,.3]);}
    } else if(mode==='free') {
      state.picture=picture(chapter,'Camera');
      if(c===0){state.blur=new THREE.Mesh(new THREE.PlaneGeometry(4,2.7),new THREE.MeshBasicMaterial({map:photoTexture('blur'),transparent:true}));state.blur.name='Blur.Full';state.blur.position.z=.12;chapter.add(state.blur);state.hands=[hand(chapter,'V',{scale:.78})];}
      else {state.effect=polygon(chapter,c===2?'mosaic':c===1?'blur':'clear');state.hands=[hand(chapter,'L.Left',{scale:.68,mirror:c===1,color:'mint'}),hand(chapter,'L.Right',{scale:.68,mirror:c===3})];state.border=wire(chapter,'Fingertip.Border','green');if(c===3)label(chapter,'180°',1.2,.45,[0,1.63,.2]);}
    } else if(mode==='painting') {
      roundedBox(chapter,'Canvas',4.25,2.8,.17,'white',[0,0,-.1]);state.stroke=stroke(chapter,'Paint.Stroke');
      if(c===1){state.stroke.mesh.visible=false;state.border=wire(chapter,'Shape');state.hands=[hand(chapter,'Pinch.Left',{scale:.58,color:'mint'}),hand(chapter,'Pinch.Right',{scale:.58})];}
      else {state.hands=[hand(chapter,c===0?'Pinch':c===2?'Palm':'Relaxed',{scale:.7})];}
      for(let i=0;i<4;i++)ball(chapter,'Paint.Color.'+i,['purple','pink','green','yellow'][i],[-1.5+i*.35,-1.58,.1],[.1,.1,.14]);
    } else if(mode==='photobooth') {
      if(c===0||c===3){state.camera=group(chapter,'Camera');roundedBox(state.camera,'Body',1.8,1.25,.5,'lilac',[.8,.2,-.3]);solid(state.camera,'Lens',new THREE.CylinderGeometry(.39,.4,.23,32),'green',[.8,.2,.32]).rotation.x=Math.PI/2;ball(state.camera,'Glass','mint',[.8,.2,.45],[.26,.26,.08]);state.hands=[hand(chapter,'Shutter.Hand',{scale:.78,color:'pink'})];if(c===0){state.progress=ring(chapter,'Hold.Progress',.65,'green',[-1.1,.12,.2]);label(chapter,'0,5 detik',1.8,.4,[-1,-1.35,.3]);}else{state.openLabel=label(chapter,'Buka telapak',2.1,.4,[-.6,1.45,.2]);state.fistLabel=label(chapter,'Kepalkan lagi',2.1,.4,[-.6,1.45,.2]);}}
      if(c===1){state.photos=[0,1,2].map(i=>{const image=picture(chapter,'Shot.'+i,1.1,1.4,i);image.group.position.set((i-1)*1.5,0,0);image.group.rotation.z=(i-1)*-.08;return image.group;});state.counts=['3','2','1'].map(text=>label(chapter,text,.7,.7,[0,1.3,.4]));}
      if(c===2){state.strip=group(chapter,'Result.Strip');roundedBox(state.strip,'Paper',1.7,3.05,.12,'white');for(let i=0;i<3;i++){const image=picture(state.strip,'Portrait.'+i,1.35,.76,i);image.group.position.set(0,.93-i*.94,.2);}state.strip.rotation.y=-.23;label(chapter,'Preview Photo',2.5,.4,[0,-1.65,.3]);}
    } else if(mode==='meme') {
      state.actor=createMascot(THREE,name=>palette[name]);state.actor.group.name='Expression.Subject';state.actor.group.scale.setScalar(.86);state.actor.group.position.set(0,.15,.1);state.actor.arm.visible=false;chapter.add(state.actor.group);
      if(c<2)state.hands=[hand(chapter,'Expression.Point',{scale:.55})];
      if(c===2){state.actor.mouth.visible=false;state.actor.eyes.forEach(eye=>eye.scale.y=.25);ball(state.actor.face,'Shock.Mouth','green',[0,-.34,.45],[.18,.25,.045]);state.hands=[hand(chapter,'Chest.Left',{scale:.45,color:'mint'}),hand(chapter,'Chest.Right',{scale:.45,mirror:true})];}
      if(c===3)ball(state.actor.face,'Tongue','pink',[.08,-.57,.48],[.12,.21,.045]);
    }
    return state;
  });
  return {root,guide,lessons,mode};
}

export function cameraPose(frame,fps) {
  const t=frame/fps;return {position:[.32*Math.sin(t*.42),2.3+Math.sin(t*.35)*.12,12.2],target:[0,.05,0],fov:27};
}
export function poseTutorial(model,frame,fps=30) {
  const t=frame/fps,c=Math.min(3,Math.floor(t/3)),local=t-c*3,state=model.lessons[c],enter=ease(local,0,.45);
  model.lessons.forEach((item,i)=>{item.group.visible=i===c;});
  model.guide.group.rotation.set(.03,-.12+Math.sin(t*.4)*.06,-.035);
  model.guide.group.position.y=-.05+Math.sin(t*1.4)*.045;
  model.guide.arm.rotation.z=-.45+Math.sin(local*2)*.11;
  model.guide.face.position.set(.035,0,0);const blink=Math.max(0,1-Math.abs((t%3)-1.25)/.12);
  model.guide.eyes.forEach(eye=>{eye.scale.y=.19*(1-blink*.92);});
  state.group.scale.setScalar(.94+.06*enter);state.group.rotation.y=-.09+Math.sin(t*.4)*.035;
  const {mode}=model;
  if(mode==='menu') {
    if(c===0)state.tiles.forEach((tile,i)=>{tile.position.z=(i===Math.min(3,Math.floor(local/.72))?.18:0);tile.rotation.y=(i%2?-.08:.08);});
    if(c===1){const h=state.hands[0];setHand(h,'point');placeTip(h,[0,.04,.72]);state.progress.geometry.setDrawRange(0,Math.floor(state.progress.geometry.index.count*ease(local,.35,1.15)/3)*3);}
    if(c===2)state.drawer.position.x=.7*(1-ease(local,.1,.9))+.7*ease(local,2.2,2.9);
    if(c===3){state.key.position.z=.4-.13*Math.sin(ease(local,.2,1)*Math.PI);state.preview.group.scale.setScalar(.75+.25*ease(local,.8,1.5));}
  } else if(mode==='free') {
    if(c===0){const h=state.hands[0];setHand(h,'peace');h.group.position.set(-.1,-.55,.8);h.group.rotation.set(.08,-.1,-.1);state.blur.material.opacity=ease(local,.4,1);}
    else {
      const spread=.15*Math.sin(local*1.4);
      state.hands.forEach((h,i)=>{setHand(h,'l');h.group.rotation.set(.05,0,(c===3||(c===2&&i===0))?Math.PI:0);h.group.position.set((i?1:-1)*(1.25+spread),c===3||(c===2&&i===0)?.4:-.4,.55);});
      model.root.updateMatrixWorld(true);
      const points=state.hands.flatMap(h=>[h.indexTip,h.thumbTip].map(tip=>state.group.worldToLocal(tip.getWorldPosition(new THREE.Vector3()))));
      const center=points.reduce((a,p)=>a.add(p),new THREE.Vector3()).multiplyScalar(.25);points.sort((a,b)=>Math.atan2(a.y-center.y,a.x-center.x)-Math.atan2(b.y-center.y,b.x-center.x));
      const angle=c===3?Math.PI*ease(local,.45,2.4):0,cos=Math.cos(angle),sin=Math.sin(angle),positions=state.effect.geometry.attributes.position,uv=state.effect.geometry.attributes.uv;
      points.forEach((p,i)=>{positions.setXYZ(i,p.x,p.y,.2);const x=p.x-center.x,y=p.y-center.y;uv.setXY(i,(center.x+x*cos-y*sin)/4+.5,(center.y+x*sin+y*cos)/2.7+.5);alignBone(state.border[i],[p.x,p.y,.24],[points[(i+1)%4].x,points[(i+1)%4].y,.24]);});
      positions.needsUpdate=true;uv.needsUpdate=true;state.effect.geometry.computeBoundingSphere();
    }
  } else if(mode==='painting') {
    if(c===1){const p=ease(local,.3,1.8);state.hands.forEach((h,i)=>{setHand(h,i===1&&local>2.25?'open':'pinch');placeTip(h,i?[.8+p*.25,-.35-p*.13,.75]:[-.8-p*.25,.4+p*.13,.75]);});rectangle(state.border,[-.8-p*.25,.4+p*.13],[.8+p*.25,-.35-p*.13]);state.border.forEach(edge=>edge.material.color.set(local>2.25?palette.green:palette.purple));}
    else {const p=ease(local,c===0?.6:.2,2.75),h=state.hands[0],position=state.stroke.curve.getPoint(p);setHand(h,c===0?'pinch':c===2?'open':'relaxed',c===0?.16*(1-ease(local,0,.6)):0);
      if(c===0)placeTip(h,[position.x,position.y,.78]);else h.group.position.set(position.x,position.y-.05,.8);
      const count=Math.floor(state.stroke.total*p/3)*3;state.stroke.mesh.geometry.setDrawRange(c===0?0:count,c===0?count:state.stroke.total-count);
    }
  } else if(mode==='photobooth') {
    if(c===0||c===3){const h=state.hands[0];setHand(h,c===3&&local<1.25?'open':'fist');h.group.position.set(-1.1,-.2,.65);if(c===0)state.progress.geometry.setDrawRange(0,Math.floor(state.progress.geometry.index.count*ease(local,.2,.7)/3)*3);else{state.openLabel.visible=local<1.25;state.fistLabel.visible=local>=1.25;}}
    if(c===1){state.photos.forEach((photo,i)=>{photo.scale.setScalar(.78+.22*ease(local,i+.6,i+.95));photo.position.z=local>i+.8?.18:0;});state.counts.forEach((count,i)=>{count.visible=i===Math.min(2,Math.floor((local%1)*3));});}
    if(c===2){state.strip.rotation.y=-.23+Math.sin(local*.9)*.08;state.strip.rotation.z=.06;}
  } else if(mode==='meme') {
    if(c<2){const h=state.hands[0];setHand(h,'point');h.group.rotation.z=c===0?.12:-.12;placeTip(h,c===0?[-.05,-.21,.61]:[1.25,1.16,.75]);}
    if(c===2)state.hands.forEach((h,i)=>{setHand(h,'relaxed');h.group.position.set(i?.28:-.28,-.84,.7);h.group.rotation.z=i?.2:-.2;});
    if(state.actor)state.actor.group.rotation.y=-.08+Math.sin(local*.9)*.06;
  }
  model.root.updateMatrixWorld(true);
  return {chapter:c,local,guide:model.guide,state};
}
export function disposeTutorial(model) {
  const geometries=new Set(),materials=new Set(),textures=new Set();
  model.root.traverse(item=>{if(item.geometry)geometries.add(item.geometry);if(item.material)materials.add(item.material);});
  materials.forEach(material=>{if(material.map)textures.add(material.map);material.dispose();});geometries.forEach(item=>item.dispose());textures.forEach(item=>item.dispose());
}
