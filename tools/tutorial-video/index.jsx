import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { registerRoot, Composition, AbsoluteFill, useCurrentFrame, useVideoConfig, staticFile, delayRender, continueRender, cancelRender } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { tutorials } from '../../web/tutorial-catalog.js';
import { createTutorialScene, poseTutorial, cameraPose, disposeTutorial, palette } from './scene.mjs';

function World({mode,frame,fps}) {
  const {camera}=useThree();
  const model=useMemo(()=>{
    const result=createTutorialScene(mode);
    result.root.traverse(item=>{if(item.isMesh){item.castShadow=!item.name.startsWith('Label.');item.receiveShadow=true;}});
    return result;
  },[mode]);
  useLayoutEffect(()=>{
    poseTutorial(model,frame,fps);
    const pose=cameraPose(frame,fps);camera.position.set(...pose.position);camera.lookAt(...pose.target);camera.fov=27;camera.updateProjectionMatrix();
  },[camera,model,frame,fps]);
  useEffect(()=>()=>disposeTutorial(model),[model]);
  return <primitive object={model.root} dispose={null}/>;
}

function Tutorial({mode}) {
  const frame=useCurrentFrame(),{width,height,fps}=useVideoConfig();
  const [ready,setReady]=useState(false),[hold]=useState(()=>delayRender('Load local Mona Sans'));
  useEffect(()=>{
    const font=new FontFace('Mona Sans','url('+staticFile('mona-sans.woff2')+')',{weight:'200 900'});
    font.load().then(loaded=>{document.fonts.add(loaded);setReady(true);continueRender(hold);}).catch(cancelRender);
  },[hold]);
  if(!ready)return null;
  const chapter=Math.min(3,Math.floor(frame/fps/3)),item=tutorials[mode],step=item.steps[chapter];
  return <AbsoluteFill style={{background:palette.white,color:palette.green,fontFamily:'Mona Sans, Arial, sans-serif'}}>
    <header style={{position:'absolute',inset:'20px 32px auto',display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:19,zIndex:2}}>
      <span style={{fontWeight:750,letterSpacing:-.7}}>EGZ <span style={{fontWeight:500}}>studio</span></span>
      <span style={{fontSize:14,color:item.color}}>{item.title} · {chapter+1}/4</span>
    </header>
    <div style={{position:'absolute',top:54,left:0,width,height:height-166}}>
      <ThreeCanvas width={width} height={height-166} camera={{position:[0,2.3,12.2],fov:27}} shadows={THREE.PCFShadowMap} gl={{antialias:true,preserveDrawingBuffer:true}} onCreated={({gl})=>{gl.toneMapping=THREE.NeutralToneMapping;gl.setClearColor(0xffffff,0);}}>
        <hemisphereLight args={['#ffffff','#c4d8ca',1.3]}/>
        <directionalLight position={[-4,7,8]} intensity={2.4} castShadow shadow-intensity={.4} shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={5} shadow-camera-bottom={-5} shadow-camera-near={.1} shadow-camera-far={25} shadow-bias={-.0004}/>
        <directionalLight position={[5,1,4]} intensity={.55}/>
        <World mode={mode} frame={frame} fps={fps}/>
      </ThreeCanvas>
    </div>
    {mode==='photobooth'&&chapter===1&&<span style={{position:'absolute',right:34,top:58,fontSize:12,color:'#58635b'}}>Demo dipercepat</span>}
    <footer style={{position:'absolute',left:34,right:34,bottom:22,borderTop:'1px solid #d2d9d4',paddingTop:13}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:5}}>
        <span style={{fontSize:14,color:item.color,fontWeight:650}}>0{chapter+1}</span>
        <strong style={{fontSize:27,fontWeight:700,letterSpacing:-.65}}>{step.title}</strong>
      </div>
      <p style={{margin:0,fontSize:16,lineHeight:1.4,color:'#48564d'}}>{step.detail}</p>
    </footer>
    <div style={{position:'absolute',bottom:0,left:0,height:4,width:(frame/(fps*item.seconds)*100)+'%',background:item.color}}/>
  </AbsoluteFill>;
}
const Root=()=> <>{Object.keys(tutorials).map(mode=><Composition key={mode} id={mode} component={Tutorial} width={960} height={540} fps={30} durationInFrames={360} defaultProps={{mode}}/>)}</>;
registerRoot(Root);
