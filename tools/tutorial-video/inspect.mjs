import * as THREE from 'three';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { tutorials } from '../../web/tutorial-catalog.js';
import { createTutorialScene, poseTutorial, cameraPose, disposeTutorial } from './scene.mjs';

const rounded = values => values.map(value=>Math.round(value*1e6)/1e6);
function snapshot(model) {
  const result=[];
  model.root.traverseVisible(object=>{result.push({name:object.name,type:object.type,world:rounded(object.matrixWorld.elements),range:object.geometry?.drawRange});});
  return result;
}
export async function inspectTutorials() {
  const fps=30,frames=360,report={engine:'Three.js 0.186.1',rig:'named transform groups; no Blender armature',axes:{up:'+Y',faceForward:'+Z',cameraSide:'+Z'},fps,framesPerClip:frames,clips:{}};
  for(const mode of Object.keys(tutorials)) {
    const model=createTutorialScene(mode),camera=new THREE.PerspectiveCamera(27,960/374,.1,50),samples=[];
    const inventory=[];model.root.traverse(object=>inventory.push({name:object.name,type:object.type,parent:object.parent?.name||null,material:object.material?.type||null}));
    let meshesChecked=0,bonesChecked=0,maxProjection=0;
    for(let frame=0;frame<frames;frame+=3) {
      const posed=poseTutorial(model,frame,fps),pose=cameraPose(frame,fps);
      camera.position.set(...pose.position);camera.lookAt(...pose.target);camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
      model.root.traverseVisible(object=>{
        assert.ok(object.matrixWorld.elements.every(Number.isFinite),`${mode}/${frame}/${object.name}: finite transform`);
        if(!object.isMesh)return;
        meshesChecked++;
        if(object.name==='Picture.Image') {
          const frameMesh=object.parent.getObjectByName('Picture.Frame');
          frameMesh.geometry.computeBoundingBox();
          assert.ok(object.position.z>frameMesh.position.z+frameMesh.geometry.boundingBox.max.z,'Portrait must sit in front of its beveled frame');
        }
        if(object.userData.ends) {
          const [a,b]=object.userData.ends.map(point=>object.parent.localToWorld(new THREE.Vector3(...point)));
          const from=new THREE.Vector3(0,-.5,0).applyMatrix4(object.matrixWorld),to=new THREE.Vector3(0,.5,0).applyMatrix4(object.matrixWorld);
          assert.ok(a.distanceTo(from)<1e-6&&b.distanceTo(to)<1e-6,`${mode}/${frame}: cylinder must meet its 3D joints`);bonesChecked++;
        }
        if(object.name.startsWith('Stage.'))return;
        object.geometry.computeBoundingBox();
        const box=object.geometry.boundingBox;
        for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
          const point=new THREE.Vector3(x,y,z).applyMatrix4(object.matrixWorld).project(camera);
          maxProjection=Math.max(maxProjection,Math.abs(point.x),Math.abs(point.y));
          assert.ok(Math.abs(point.x)<1&&Math.abs(point.y)<1&&point.z>-1&&point.z<1,`${mode}/${frame}/${object.name}: visible geometry clips camera (${point.x.toFixed(2)},${point.y.toFixed(2)})`);
        }
      });
      const {state,chapter,local}=posed;
      if(mode==='painting'&&chapter===0&&local>=.65)assert.ok(state.hands[0].indexTip.getWorldPosition(new THREE.Vector3()).distanceTo(state.hands[0].thumbTip.getWorldPosition(new THREE.Vector3()))<1e-6,'Drawing pinch makes contact');
      if(mode==='painting'&&chapter===1&&local>.5&&local<2.25){const [a,b]=state.hands.map(h=>h.indexTip.getWorldPosition(new THREE.Vector3()));assert.ok(Math.abs(a.x-b.x)>1&&Math.abs(a.y-b.y)>.4,'Two pinches define diagonal shape corners');}
      if(mode==='painting'&&chapter===1&&local>2.4)assert.deepEqual(state.hands.map(h=>h.group.userData.pose),['pinch','open'],'Release one pinch while both hands remain visible');
      if(mode==='free'&&chapter>0)state.hands.forEach((h,index)=>{
        const tip=h.indexTip.getWorldPosition(new THREE.Vector3()),palm=h.group.getWorldPosition(new THREE.Vector3()),thumb=h.thumbTip.getWorldPosition(new THREE.Vector3());
        const down=chapter===3||(chapter===2&&index===0);
        assert.ok(down?tip.y<palm.y-.3:tip.y>palm.y+.3,'L index direction matches lesson');
        assert.ok(index===0?thumb.x>tip.x:thumb.x<tip.x,'L thumbs face inward');
      });
      if(frame%30===0||frame%90===87){
        const guide=new THREE.Box3().setFromObject(model.guide.group);
        samples.push({frame,chapter,guideWorldBounds:{min:rounded(guide.min.toArray()),max:rounded(guide.max.toArray())},hands:state.hands.map(h=>({name:h.group.name,pose:h.group.userData.pose,mirrored:h.group.scale.x<0,index:rounded(h.indexTip.getWorldPosition(new THREE.Vector3()).toArray()),thumb:rounded(h.thumbTip.getWorldPosition(new THREE.Vector3()).toArray())}))});
      }
    }
    poseTutorial(model,75,fps);const before=snapshot(model);poseTutorial(model,315,fps);poseTutorial(model,75,fps);assert.deepEqual(snapshot(model),before,mode+': seeking must reproduce the same state');
    report.clips[mode]={inventory,meshesChecked,bonesChecked,maxProjectedExtent:maxProjection,samples};disposeTutorial(model);
  }
  const output=resolve(import.meta.dirname,'../../docs/ui-preview/tutorial-revamp');await mkdir(output,{recursive:true});
  await writeFile(resolve(output,'scene-inspection.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({inspection:'pass',clips:Object.keys(report.clips),sampledFrames:120*5,axes:report.axes,blender:'not used; inspected the actual Three scene instead'}));
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await inspectTutorials();
