import React from 'react';
import { registerRoot, Composition, AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { tutorials } from '../../web/tutorial-catalog.js';

const paper = '#f6f8f5', green = '#0d6731', lime = '#d1f441';
const smooth = (t, start, end, from, to) => interpolate(t, [start, end], [from, to], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });

function Ball({ position, scale = 1, color = green }) {
  return <mesh position={position} scale={scale}><sphereGeometry args={[1, 16, 12]}/><meshStandardMaterial color={color} roughness={.52}/></mesh>;
}
function Bone({ a, b, radius = .12, color }) {
  const midpoint = a.map((v, i) => (v + b[i]) / 2);
  const length = Math.hypot(...a.map((v, i) => b[i] - v));
  // Pose bones stay in the XY plane; the whole hand can rotate in true 3D.
  const angle = Math.atan2(-(b[0] - a[0]), b[1] - a[1]);
  return <group><mesh position={midpoint} rotation={[0, 0, angle]}><cylinderGeometry args={[radius, radius * 1.08, length, 12]}/><meshStandardMaterial color={color} roughness={.48}/></mesh><Ball position={a} scale={radius * 1.05} color={color}/><Ball position={b} scale={radius} color={color}/></group>;
}
function Hand({ pose = 'open', position = [0, 0, 0], rotation = [0, 0, 0], mirror = false, color = '#c898fd', pinch = 0 }) {
  const extended = pose === 'open' ? [1, 1, 1, 1] : pose === 'peace' ? [1, 1, 0, 0] : ['point', 'l', 'pinch'].includes(pose) ? [1, 0, 0, 0] : [0, 0, 0, 0];
  const xs = [-.42, -.13, .17, .45], lengths = [.95, 1.12, 1.03, .8];
  const touch = pose === 'pinch';
  return <group position={position} rotation={rotation} scale={[mirror ? -.86 : .86, .86, .86]}>
    <Ball position={[0, -.05, 0]} scale={[.64, .66, .24]} color={color}/>
    <Bone a={[-.22, -.56, 0]} b={[-.24, -.94, -.03]} radius={.25} color={color}/>
    {xs.map((x, i) => {
      const base = [x, .34, 0], open = extended[i];
      const mid = touch && i === 0 ? [-.7, .89, .03] : open ? [x, .34 + lengths[i] * .52, 0] : [x, .48, .27];
      const tip = touch && i === 0 ? [-.78 + pinch, .9 + pinch * .5, .09] : open ? [x, .34 + lengths[i], .02] : [x, .14, .35];
      return <group key={i}><Bone a={base} b={mid} color={color}/><Bone a={mid} b={tip} radius={.105} color={color}/></group>;
    })}
    <Bone a={[-.48, -.12, .06]} b={touch ? [-.83, .38, .08] : pose === 'l' || pose === 'open' ? [-1, .03, .02] : [-.61, .27, .3]} radius={.14} color={color}/>
    <Bone a={touch ? [-.83, .38, .08] : pose === 'l' || pose === 'open' ? [-1, .03, .02] : [-.61, .27, .3]} b={touch ? [-.78 - pinch, .9 - pinch * .5, .09] : pose === 'l' || pose === 'open' ? [-1.34, .09, .02] : [-.18, .38, .38]} radius={.12} color={color}/>
  </group>;
}
function Face({ expression, color = lime }) {
  const shock = expression === 2, tongue = expression === 3;
  return <group position={[0, .38, -.65]}>
    <Ball position={[0, .25, 0]} scale={[.94, 1.04, .46]} color={color}/>
    <Ball position={[-.3, .52, .42]} scale={[.075, shock ? .14 : .07, .055]} />
    <Ball position={[.3, .52, .42]} scale={[.075, shock ? .14 : .07, .055]} />
    <mesh position={[0, .04, .44]} scale={[shock ? .21 : .33, shock ? .3 : .16, 1]}><circleGeometry args={[1, 32, shock ? 0 : Math.PI, shock ? Math.PI * 2 : Math.PI]}/><meshBasicMaterial color={green} side={2}/></mesh>
    {tongue && <Ball position={[.03, -.1, .49]} scale={[.12, .22, .04]} color="#ff80d2"/>}
  </group>;
}
function Scene({ mode, t, chapter, local }) {
  const turn = .12 + Math.sin(t * .5) * .09;
  if (mode === 'menu') return <Hand pose="point" position={[chapter % 2 ? 2.03 : -1.77, chapter < 2 ? .44 : -.47, 0]} rotation={[.15, turn, -.2]}/>;
  if (mode === 'free') {
    if (!chapter) return <Hand pose="peace" rotation={[.12, turn, -.14]}/>;
    const spread = .25 * Math.sin(local * 1.4);
    return <><Hand pose="l" mirror position={[-1.5 - spread, chapter === 3 ? .65 : -.2, 0]} rotation={[.12, turn, chapter === 3 ? Math.PI : 0]} color="#8cf2a6"/><Hand pose="l" position={[1.5 + spread, chapter > 1 ? .65 : -.2, 0]} rotation={[.12, -turn, chapter > 1 ? Math.PI : 0]}/></>;
  }
  if (mode === 'painting') {
    const move = Math.sin(local * 1.6) * 1.2;
    if (chapter === 1) return <><Hand pose="pinch" position={[-1.2 - local * .12, 0, 0]} color="#8cf2a6"/><Hand pose="pinch" mirror position={[1.2 + local * .12, 0, 0]}/></>;
    return <Hand pose={chapter === 0 ? 'pinch' : chapter === 2 ? 'open' : 'fist'} position={[move, -.2 + Math.sin(local * 1.3) * .35, 0]} rotation={[.08, turn, -.12]} pinch={chapter === 0 ? smooth(local, 0, .6, .18, 0) : 0}/>;
  }
  if (mode === 'photobooth') return chapter === 0 ? <Hand pose="fist" rotation={[.15, turn, -.1]} color="#ff80d2"/> : <><Face expression={chapter === 1 ? 1 : 0}/>{chapter === 1 && <Hand pose="peace" position={[1.55, -.25, .1]} rotation={[0, -.15, -.25]} color="#ff80d2"/>}</>;
  return <><Face expression={chapter}/>{chapter < 2 && <Hand pose="point" position={chapter === 0 ? [1.02, -.35, .5] : [1.65, -.05, .3]} rotation={chapter === 0 ? [0, -.25, .55] : [0, -.2, -.15]}/>} {chapter === 2 && <><Hand pose="fist" position={[-.58, -1.15, .1]} rotation={[.15, .35, -.35]}/><Hand pose="fist" mirror position={[.58, -1.15, .1]} rotation={[.15, -.35, .35]} color="#8cf2a6"/></>}</>;
}
function Tutorial({ mode }) {
  const frame = useCurrentFrame(), { fps, width, height } = useVideoConfig();
  const t = frame / fps, chapter = Math.min(3, Math.floor(t / 3)), local = t % 3;
  const item = tutorials[mode], step = item.steps[chapter];
  const entrance = smooth(local, 0, .45, .94, 1), opacity = smooth(local, 0, .3, 0, 1);
  return <AbsoluteFill style={{ background: paper, fontFamily: 'Arial, sans-serif', color: green }}>
    <AbsoluteFill style={{ backgroundImage: 'linear-gradient(#0d673109 1px,transparent 1px),linear-gradient(90deg,#0d673109 1px,transparent 1px)', backgroundSize: '48px 48px' }}/>
    <div style={{ position: 'absolute', top: 28, left: 34, fontSize: 20, fontWeight: 700 }}>EGZ <span style={{ fontWeight: 400 }}>studio</span></div>
    <div style={{ position: 'absolute', top: 32, right: 34, color: item.color, fontSize: 16 }}>{item.title} / 0{chapter + 1}</div>
    <div style={{ position: 'absolute', inset: '56px 100px 104px', borderRadius: 44, background: ['#e4f8e9', '#f0e5ff', '#ffe5f5', '#fff8d6'][chapter], opacity: .7 }}/>
    {mode === 'menu' && <div style={{ position: 'absolute', left: 150, right: 150, top: 130, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>{['Efek Tangan', 'Painting', 'Photobooth', 'Meme'].map((title, i) => <div key={title} style={{ padding: 18, borderRadius: 16, border: `2px solid ${chapter === i ? item.color : '#d2d9d4'}`, background: chapter === i ? lime : '#ffffffb0', fontSize: 22 }}>{title}</div>)}</div>}
    {mode === 'painting' && <svg viewBox="0 0 960 540" style={{ position: 'absolute', inset: 0 }}><path d="M230 325Q350 170 440 290T690 240" fill="none" stroke="#8534f3" strokeWidth="16" strokeLinecap="round" strokeDasharray="680" strokeDashoffset={chapter < 2 ? 680 * (1 - Math.min(local / 2, 1)) : 680 * Math.min(local / 2, 1)}/>{chapter === 1 && <rect x={330 - local * 20} y="175" width={270 + local * 40} height="160" rx="16" fill="none" stroke="#8534f3" strokeWidth="5"/>}</svg>}
    {mode === 'free' && chapter > 0 && <div style={{ position: 'absolute', left: '31%', top: '27%', width: '38%', height: '32%', border: `3px dashed ${item.color}`, borderRadius: 18, background: chapter === 2 ? 'repeating-conic-gradient(#8534f350 0% 25%,#8cf2a670 0% 50%) 0/28px 28px' : '#ffffff90', transform: `rotate(${chapter === 3 ? smooth(local, .2, 2.2, 0, 180) : 0}deg)` }}/>}
    <AbsoluteFill style={{ transform: `scale(${entrance})`, opacity }}><ThreeCanvas width={width} height={height} camera={{ position: [0, .4, 8.8], fov: 38 }} gl={{ antialias: true }}><ambientLight intensity={1.7}/><directionalLight position={[-4, 5, 7]} intensity={2.6}/><directionalLight position={[4, -1, 3]} intensity={1.2}/><Scene mode={mode} t={t} chapter={chapter} local={local}/></ThreeCanvas></AbsoluteFill>
    {mode === 'photobooth' && chapter === 1 && <div style={{ position: 'absolute', right: 170, top: 150, fontSize: 100, fontWeight: 800, color: item.color }}>{3 - Math.min(2, Math.floor(local))}</div>}
    {mode === 'photobooth' && chapter > 1 && <div style={{ position: 'absolute', right: 150, top: 115, width: 106, padding: 9, background: 'white', border: `2px solid ${item.color}`, transform: `rotate(${6 + Math.sin(t) * 2}deg)` }}>{[0, 1, 2].map(i => <div key={i} style={{ height: 55, background: ['#8cf2a6', '#c898fd', '#ff80d2'][i], marginBottom: 6, borderRadius: 5 }}/>)}</div>}
    <div style={{ position: 'absolute', bottom: 36, left: 34, right: 34, display: 'flex', alignItems: 'center', gap: 16 }}><span style={{ background: item.color, color: 'white', borderRadius: 50, width: 38, height: 38, display: 'grid', placeItems: 'center', fontSize: 17 }}>{chapter + 1}</span><span style={{ fontSize: 27, fontWeight: 700 }}>{step.title}</span><span style={{ marginLeft: 'auto', fontSize: 16 }}>{String(Math.floor(t)).padStart(2, '0')} / 12s</span></div>
    <div style={{ position: 'absolute', bottom: 0, left: 0, width: `${frame / (fps * 12) * 100}%`, height: 5, background: item.color }}/>
  </AbsoluteFill>;
}
const Root = () => <>{Object.keys(tutorials).map(mode => <Composition key={mode} id={mode} component={Tutorial} width={960} height={540} fps={20} durationInFrames={240} defaultProps={{ mode }}/>)}</>;
registerRoot(Root);
