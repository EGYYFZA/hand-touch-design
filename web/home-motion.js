const stage = document.querySelector('.stage');
const opening = document.getElementById('empty-state');
const art = document.getElementById('home-art');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const splash = document.getElementById('home-splash');
const splashStarted = performance.now();
let splashDismissed = false;
let splashTimeout = setTimeout(() => dismissSplash(true), 4000);
let scene = null, modulePromise = null, generation = 0;
let failed = false, greeted = false;

function dismissSplash(immediate = false) {
  if (splash.hidden || splash.dataset.dismissed === 'true' || (splashDismissed && !immediate)) return;
  splashDismissed = true; clearTimeout(splashTimeout);
  splashTimeout = setTimeout(() => {
    splash.dataset.dismissed = 'true';
    setTimeout(() => {
      const restoreFocus = splash.contains(document.activeElement);
      splash.hidden = true;
      if (restoreFocus) document.getElementById('start-camera').focus({ preventScroll: true });
    }, reduced.matches ? 0 : 180);
  }, immediate || reduced.matches ? 0 : Math.max(0, 550 - (performance.now() - splashStarted)));
}
document.getElementById('splash-skip').addEventListener('click', () => dismissSplash(true));
document.addEventListener('keydown', event => { if (event.key === 'Escape') dismissSplash(true); });

function wanted() {
  return !opening.hidden && !document.hidden && !reduced.matches &&
    art.getBoundingClientRect().height > 0 && !document.querySelector('dialog[open]');
}

function release() {
  generation++;
  scene?.dispose(); scene = null;
  document.body.dataset.homeScene = 'fallback';
  document.body.dataset.homeMotion = 'paused';
  dismissSplash(true);
}

async function sync() {
  if (!wanted() || failed) { release(); return; }
  if (scene) { scene.resize(); return; }
  const request = ++generation;
  document.body.dataset.homeScene = 'loading';
  try {
    const { createHomeScene } = await (modulePromise ??= import('./home-scene.js'));
    // Loading must not bring the decoration back over an active camera/dialog.
    if (request !== generation || !wanted()) return;
    scene = createHomeScene(stage, art, {
      greet: !greeted,
      activity: running => { document.body.dataset.homeMotion = running ? 'running' : 'paused'; },
      failure: () => { failed = true; release(); },
      painted: () => {
        if (request !== generation) return;
        document.body.dataset.homeScene = 'ready';
        dismissSplash();
      },
    });
    greeted = true;
  } catch { failed = true; release(); }
}

export function setHomeCameraStarting(value) {
  document.body.dataset.homeCamera = value ? 'pending' : 'idle';
  if (value) { dismissSplash(true); splash.hidden = true; }
  sync();
}

document.addEventListener('visibilitychange', sync);
reduced.addEventListener('change', sync);
finePointer.addEventListener('change', () => scene?.point(0, 0));
new MutationObserver(sync).observe(opening, { attributes: true, attributeFilter: ['hidden'] });
new MutationObserver(sync).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
const layout = new ResizeObserver(sync);
layout.observe(art); layout.observe(opening);
window.addEventListener('resize', sync);
window.addEventListener('pagehide', release);
window.addEventListener('pageshow', sync);
stage.addEventListener('pointerleave', () => scene?.point(0, 0));
stage.addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' || !finePointer.matches || !scene) return;
  scene.point(event.clientX / innerWidth * 2 - 1, event.clientY / innerHeight * 2 - 1);
});
sync();
