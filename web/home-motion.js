// No animation loop: CSS owns the timeline; pointer updates are bounded to one frame.
const stage = document.querySelector('.stage');
const opening = document.getElementById('empty-state');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
let frame = 0;
let point = null;

function resetPointer() {
  cancelAnimationFrame(frame); frame = 0; point = null;
  for (const key of ['--scene-x', '--scene-y', '--look-x', '--look-y']) stage.style.removeProperty(key);
}

function syncMotion() {
  const running = !reduced.matches && !opening.hidden && !document.hidden;
  document.body.dataset.homeMotion = running ? 'running' : 'paused';
  if (!running) resetPointer();
}

document.addEventListener('visibilitychange', syncMotion);
reduced.addEventListener('change', syncMotion);
finePointer.addEventListener('change', resetPointer);
new MutationObserver(syncMotion).observe(opening, { attributes: true, attributeFilter: ['hidden'] });
stage.addEventListener('pointerleave', resetPointer);
stage.addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' || !finePointer.matches || document.body.dataset.homeMotion !== 'running') return;
  point = { x: Math.max(-1, Math.min(1, event.clientX / innerWidth * 2 - 1)), y: Math.max(-1, Math.min(1, event.clientY / innerHeight * 2 - 1)) };
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    stage.style.setProperty('--scene-x', `${point.x * 8}px`);
    stage.style.setProperty('--scene-y', `${point.y * 6}px`);
    stage.style.setProperty('--look-x', `${point.x * 2.5}px`);
    stage.style.setProperty('--look-y', `${point.y * 2}px`);
  });
});
syncMotion();
