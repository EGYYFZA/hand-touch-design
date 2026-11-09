import * as THREE from './vendor/three.module.js';
import { createMascot } from './mascot.js';

export function createHomeScene(stage, art, { greet, activity, failure, painted }) {
  const colors = getComputedStyle(document.documentElement);
  const color = name => colors.getPropertyValue(`--festival-${name}`).trim();
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.domElement.className = 'home-scene';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, matchMedia('(max-width:760px), (pointer:coarse)').matches ? 1 : 1.5));
  renderer.setClearColor(0xffffff, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 50);
  camera.position.z = 14;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb0cbb7, 1.3));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-3, 5, 8); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, .55); fill.position.set(5, -1, 4); scene.add(fill);
  let frame = 0, disposed = false, lastFrame = 0, width = 0, height = 0, hasPainted = false;
  let baseX = 0, baseY = 0, size = 1, lookX = 0, lookY = 0, targetX = 0, targetY = 0;
  const started = performance.now();
  const materials = new Map();
  function material(name) {
    if (!materials.has(name)) materials.set(name, new THREE.MeshStandardMaterial({ color: color(name), roughness: .65, metalness: 0 }));
    return materials.get(name);
  }
  function mesh(parent, geometry, mat, position = [0, 0, 0], scale = [1, 1, 1]) {
    const item = new THREE.Mesh(geometry, mat); item.position.set(...position); item.scale.set(...scale); parent.add(item); return item;
  }
  function ball(parent, position, scale, name = 'green') {
    return mesh(parent, new THREE.SphereGeometry(1, 20, 14), material(name), position, scale);
  }

  function roundedShape(points) {
    const shape = new THREE.Shape(), midpoint = (a, b) => a.map((v, i) => (v + b[i]) / 2);
    shape.moveTo(...midpoint(points.at(-1), points[0]));
    points.forEach((point, i) => shape.quadraticCurveTo(...point, ...midpoint(point, points[(i + 1) % points.length])));
    shape.closePath(); return shape;
  }
  function extrude(parent, shape, name, depth = .35, bevel = .1) {
    return mesh(parent, new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 4, steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 8 }), material(name));
  }
  const {group:mascot,face,eyes,arm}=createMascot(THREE,color); scene.add(mascot);

  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64;
  const shadowCtx = shadowCanvas.getContext('2d'), gradient = shadowCtx.createRadialGradient(32,32,2,32,32,32);
  gradient.addColorStop(0,'#163a2b28'); gradient.addColorStop(1,'#163a2b00'); shadowCtx.fillStyle = gradient; shadowCtx.fillRect(0,0,64,64);
  const shadowMap = new THREE.CanvasTexture(shadowCanvas);
  const shadow = mesh(scene, new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false }));

  const decorations = [];
  function decoration(kind, name) {
    const group = new THREE.Group(); scene.add(group); decorations.push(group);
    if (kind === 'tile') {
      const tile = new THREE.Shape();
      tile.moveTo(-.55,-.8); tile.lineTo(.55,-.8); tile.quadraticCurveTo(.8,-.8,.8,-.55);
      tile.lineTo(.8,.55); tile.quadraticCurveTo(.8,.8,.55,.8); tile.lineTo(-.55,.8);
      tile.quadraticCurveTo(-.8,.8,-.8,.55); tile.lineTo(-.8,-.55); tile.quadraticCurveTo(-.8,-.8,-.55,-.8);
      extrude(group, tile, name, .22, .1);
      const crossA = mesh(group, new THREE.CapsuleGeometry(.07,.6,4,12), material('green'), [0,0,.4]);
      const crossB = crossA.clone(); crossB.rotation.z = Math.PI/2; group.add(crossB);
    } else if (kind === 'star') {
      const points = Array.from({length:10},(_,i)=>{const a=i*Math.PI/5+Math.PI/2,r=i%2?.43:.88;return [Math.cos(a)*r,Math.sin(a)*r];});
      extrude(group,roundedShape(points),name,.25,.07);
    } else if (kind === 'pill') {
      const pill = mesh(group,new THREE.CapsuleGeometry(.36,.9,6,20),material(name)); pill.rotation.z = Math.PI/2;
      ball(group,[-.31,0,.35],[.065,.065,.025]); ball(group,[.31,0,.35],[.065,.065,.025]);
    } else {
      mesh(group,new THREE.TorusGeometry(.59,.15,12,36,Math.PI*1.45),material(name)).rotation.z = -.6;
    }
    return group;
  }
  decoration('tile','mint'); decoration('star','lilac'); decoration('pill','yellow'); decoration('ribbon','pink');

  function resize() {
    if (disposed) return;
    const bounds = stage.getBoundingClientRect(), anchor = art.getBoundingClientRect();
    width = bounds.width; height = bounds.height;
    renderer.setSize(width, height, false);
    camera.left = -width/200; camera.right = width/200; camera.top = height/200; camera.bottom = -height/200; camera.updateProjectionMatrix();
    baseX = (anchor.x + anchor.width/2 - bounds.x - width/2)/100;
    baseY = (height/2 - (anchor.y + anchor.height/2 - bounds.y))/100;
    size = Math.min(anchor.width/4.8, anchor.height/4.05)/100;
    const compact = width < 700;
    const placements = compact ? [[.11,.3,34],[.88,.24,37],[.9,.26,0],[.15,.76,0]] : [[.18,.32,75],[.82,.29,80],[.8,.73,91],[.19,.73,67]];
    decorations.forEach((item,i)=>{
      const [x,y,pixels]=placements[i]; item.visible=pixels>0;
      item.position.set((x-.5)*width/100,(.5-y)*height/100,-.5);
      item.scale.setScalar(pixels/160); item.rotation.set(.18,[-.28,.3,.1,-.2][i],[-.22,.18,.22,-.2][i]);
      item.userData.restPosition = item.position.clone();
      item.userData.restRotation = item.rotation.clone();
    });
    wake();
  }
  function draw(now) {
    frame = 0;
    if (disposed) return;
    if (now - lastFrame < 1000/30) { frame = requestAnimationFrame(draw); return; }
    const dt = Math.min((now - lastFrame)/1000 || 1/30,.1);
    lastFrame = now - (now - lastFrame) % (1000/30);
    const t = greet ? Math.min((now-started)/1000,4) : 4;
    const enter = 1-Math.pow(1-Math.min(t/.7,1),3);
    const blend = 1-Math.exp(-dt*12);
    lookX += (targetX-lookX)*blend; lookY += (targetY-lookY)*blend;
    mascot.position.set(baseX,baseY+(1-enter)*.22,0);
    mascot.scale.setScalar(size*(.88+.12*enter));
    mascot.rotation.set(.08+lookY*.09,-.28+lookX*.18,-.07+(1-enter)*.12);
    face.position.set(lookX*.055,-lookY*.045,0);
    decorations.forEach((item,i)=>{
      const depth = (width<700 ? .06 : .14) + i*.02;
      item.position.copy(item.userData.restPosition);
      item.position.x += lookX*depth; item.position.y -= lookY*depth*.7;
      item.rotation.copy(item.userData.restRotation);
      item.rotation.x += lookY*.12; item.rotation.y += lookX*.2; item.rotation.z += lookX*.06;
    });
    const blink = Math.max(0,1-Math.abs(t-1.75)/.13);
    eyes.forEach(eye=>{eye.scale.y=.19*(1-blink*.92);});
    arm.rotation.z = t>.65&&t<2.65 ? Math.sin((t-.65)*Math.PI*3)*.25 : 0;
    shadow.position.set(baseX,baseY-size*1.85,-1); shadow.scale.set(size*3.4,size*.45,1);
    try { renderer.render(scene,camera); }
    catch { failure(); return; }
    if (!hasPainted) { hasPainted = true; painted(); }
    const moving = t<4 || Math.abs(targetX-lookX)+Math.abs(targetY-lookY)>.002;
    activity(moving);
    if (moving) frame=requestAnimationFrame(draw);
  }
  function wake() { if (!disposed&&!frame) { activity(true); frame=requestAnimationFrame(draw); } }
  function point(x,y) { targetX=Math.max(-1,Math.min(1,x));targetY=Math.max(-1,Math.min(1,y));wake(); }
  function lost(event) { event.preventDefault(); failure(); }
  function dispose() {
    if (disposed) return;
    disposed=true; cancelAnimationFrame(frame); renderer.domElement.removeEventListener('webglcontextlost',lost);
    const geometries=new Set(), usedMaterials=new Set();
    scene.traverse(item=>{if(item.geometry)geometries.add(item.geometry);if(item.material)usedMaterials.add(item.material);});
    geometries.forEach(item=>item.dispose());usedMaterials.forEach(item=>item.dispose());shadowMap.dispose();
    renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();activity(false);
  }
  try {
    stage.append(renderer.domElement); renderer.domElement.addEventListener('webglcontextlost',lost);
    resize();
    return { resize, point, dispose };
  } catch(error) { dispose(); throw error; }
}
