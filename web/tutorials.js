import { tutorials, TUTORIAL_PREFERENCE } from './tutorial-catalog.js';

export function initializeTutorials({ canOpen = () => true, notice = () => {}, beforeOpen = () => {}, afterClose = () => {} } = {}) {
  const $ = id => document.getElementById(id);
  const dialog = $('tutorial-dialog'), video = $('tutorial-video');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let auto = true, active = 'menu', returnTarget = null, request = 0, pendingSeek = null;
  try { auto = localStorage.getItem(TUTORIAL_PREFERENCE) !== 'off'; } catch { /* In-memory preference still works. */ }

  function syncPreference() { $('tutorial-auto').setAttribute('aria-checked', String(auto)); }
  function setChapter(index) {
    const item = tutorials[active], step = item.steps[index];
    $('tutorial-step').textContent = step.detail;
    for (const [i, button] of [...$('tutorial-chapters').children].entries()) button.setAttribute('aria-current', String(i === index));
  }
  async function play(version = request) {
    if (version !== request || !dialog.open || document.hidden) return;
    try { await video.play(); }
    catch { /* Native Play remains available if autoplay is blocked. */ }
    if (version === request && (!dialog.open || document.hidden)) video.pause();
  }
  function select(id, autoplay = !reduced.matches) {
    if (!tutorials[id]) return;
    active = id; request++; pendingSeek = null;
    video.pause();
    $('tutorial-title').textContent = tutorials[id].title;
    video.setAttribute('aria-label', `Video tutorial ${tutorials[id].title}`);
    video.poster = `tutorials/${id}.jpg`;
    // Same-origin filenames come only from the fixed catalog, never URL/user input.
    video.src = `tutorials/${id}.mp4`;
    const track = $('tutorial-captions'); track.src = `tutorials/${id}.vtt`;
    $('tutorial-media-status').hidden = true;
    for (const button of dialog.querySelectorAll('[data-tutorial]')) button.setAttribute('aria-pressed', String(button.dataset.tutorial === id));
    $('tutorial-chapters').replaceChildren(...tutorials[id].steps.map((step, index) => {
      const button = document.createElement('button'); button.type = 'button';
      button.setAttribute('aria-label', `${index + 1}. ${step.title}`);
      const number = document.createElement('span'); number.textContent = String(index + 1);
      const name = document.createElement('span'); name.textContent = step.title;
      button.append(number, name);
      button.addEventListener('click', () => {
        if (!video.error) {
          if (Number.isFinite(video.duration)) video.currentTime = step.at;
          else pendingSeek = { version: request, at: step.at };
          play();
        }
        setChapter(index);
      });
      return button;
    }));
    setChapter(0); video.load();
    if (autoplay) play();
  }
  function open(id = 'menu', automatic = false) {
    if (automatic && !auto) return false;
    if (!canOpen() || document.querySelector('dialog[open]:not(#tutorial-dialog)')) {
      if (!automatic) notice('Tutorial tersedia setelah sesi atau dialog ini selesai.');
      return false;
    }
    if (!dialog.open) {
      returnTarget = document.activeElement;
      beforeOpen();
      dialog.showModal();
      const cursor = $('gesture-cursor'); if (cursor) dialog.append(cursor);
      $('tutorial-skip').focus({ preventScroll: true });
    }
    select(id); return true;
  }
  function close() { if (dialog.open) dialog.close(); }
  $('tutorial-open').addEventListener('click', () => open(document.body.dataset.phase === 'studio' ? document.body.dataset.mode : 'menu'));
  $('tutorial-close').addEventListener('click', close);
  $('tutorial-skip').addEventListener('click', close);
  $('tutorial-auto').addEventListener('click', () => {
    auto = !auto; syncPreference();
    try { localStorage.setItem(TUTORIAL_PREFERENCE, auto ? 'on' : 'off'); }
    catch { notice('Pilihan tutorial berlaku selama tab ini terbuka.'); }
  });
  for (const button of dialog.querySelectorAll('[data-tutorial]')) button.addEventListener('click', () => select(button.dataset.tutorial));
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button,video,[tabindex="0"]')].filter(element => !element.disabled && element.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  video.addEventListener('timeupdate', () => {
    const steps = tutorials[active].steps;
    setChapter(Math.max(0, steps.findLastIndex(step => video.currentTime >= step.at)));
  });
  video.addEventListener('loadedmetadata', () => {
    if (pendingSeek?.version === request && dialog.open) video.currentTime = pendingSeek.at;
    pendingSeek = null;
  });
  video.addEventListener('error', () => { if (dialog.open) $('tutorial-media-status').hidden = false; });
  $('tutorial-retry').addEventListener('click', () => select(active, true));
  dialog.addEventListener('close', () => {
    request++; video.pause();
    video.removeAttribute('src'); $('tutorial-captions').removeAttribute('src'); video.load();
    const cursor = $('gesture-cursor'); if (cursor) document.body.append(cursor);
    afterClose();
    if (!document.querySelector('dialog[open]')) {
      const target = returnTarget?.isConnected && returnTarget.getClientRects().length ? returnTarget : $('mode-title');
      target.focus({ preventScroll: true });
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); });
  reduced.addEventListener('change', () => { if (reduced.matches) video.pause(); });
  syncPreference();
  return { enterMenu: () => open('menu', true), modeChanged: id => open(id, true), close };
}
