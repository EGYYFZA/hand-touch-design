// Each host supplies its own Three namespace; the video tool and website use separate versions.
export function createMascot(THREE, color) {
  const group = new THREE.Group(); group.name = 'EGZ.Mascot';
  const materials = new Map();
  function material(name) {
    if (!materials.has(name)) materials.set(name, new THREE.MeshStandardMaterial({ color: color(name), roughness: .65, metalness: 0 }));
    return materials.get(name);
  }
  function ball(parent, position, scale, name = 'green') {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), material(name));
    mesh.position.set(...position); mesh.scale.set(...scale); parent.add(mesh); return mesh;
  }
  function tube(parent, points, radius) {
    const curve = new THREE.QuadraticBezierCurve3(...points.map(p => new THREE.Vector3(...p)));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 8, false), material('green'));
    parent.add(mesh); return mesh;
  }
  const outline = [[80,12],[98,39],[130,32],[128,65],[150,85],[121,101],[118,134],[87,123],[61,145],[47,115],[15,109],[29,79],[15,50],[47,46],[58,17],[80,31]];
  const points = outline.map(([x,y]) => [(x-80)/40,(80-y)/40]);
  const midpoint = (a,b) => a.map((v,i)=>(v+b[i])/2), shape = new THREE.Shape();
  shape.moveTo(...midpoint(points.at(-1),points[0]));
  points.forEach((point,i)=>shape.quadraticCurveTo(...point,...midpoint(point,points[(i+1)%points.length]))); shape.closePath();
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.42,bevelEnabled:true,bevelSegments:4,steps:1,bevelSize:.14,bevelThickness:.14,curveSegments:8}),material('lime'));
  body.name='Body';body.position.z=-.2;group.add(body);
  const face=new THREE.Group();face.name='Face';group.add(face);
  const eyes=[-.43,.36].map((x,i)=>{const eye=ball(face,[x,.25,.42],[.105,.19,.075]);eye.name=i?'Eye.R':'Eye.L';ball(eye,[-.2,.35,.8],[.19,.14,.16],'white');return eye;});
  const mouth=new THREE.Group();mouth.name='Smile';face.add(mouth);
  tube(mouth,[[-.43,-.27,.43],[-.08,-.75,.5],[.35,-.26,.43]],.044);
  ball(mouth,[-.43,-.27,.43],[.044,.044,.044]);ball(mouth,[.35,-.26,.43],[.044,.044,.044]);
  ball(face,[-.7,-.06,.4],[.13,.05,.025],'pink');ball(face,[.63,-.05,.4],[.13,.05,.025],'pink');
  tube(group,[[-1.16,-.02,.01],[-1.68,-.14,.04],[-1.84,-.48,.08]],.055);
  ball(group,[-1.84,-.48,.08],[.15,.13,.11],'mint');
  const arm=new THREE.Group();arm.name='WaveArm';arm.position.set(1.13,.05,.02);group.add(arm);
  tube(arm,[[0,0,0],[.48,.03,.06],[.64,.55,.06]],.055);
  const hand=new THREE.Group();hand.name='WaveHand';hand.position.set(.65,.61,.08);hand.rotation.z=-.35;arm.add(hand);
  ball(hand,[0,0,0],[.19,.22,.11],'mint');
  for(let i=0;i<3;i++){
    const finger=new THREE.Mesh(new THREE.CapsuleGeometry(.052,.16+(i===1?.07:0),4,10),material('mint'));
    finger.position.set((i-1)*.115,.19,0);finger.rotation.z=(1-i)*.2;hand.add(finger);
  }
  ball(hand,[-.19,-.01,0],[.11,.065,.075],'mint');
  return {group,body,face,eyes,mouth,arm};
}
