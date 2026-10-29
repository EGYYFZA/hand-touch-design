// A guest preview is a visual deterrent, not DRM: the camera and local cache
// remain controlled by the person using this browser.
export async function createGuestPreview(original) {
  const image = await createImageBitmap(original);
  try {
    if (!image.width || !image.height) throw new Error('Invalid photo');
    const scale = Math.min(1, 960 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Preview unavailable');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const size = Math.max(14, Math.min(30, canvas.width / 15));
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 7);
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.lineWidth = 3;
    const extent = Math.hypot(canvas.width, canvas.height);
    const stepX = size * 12, stepY = size * 3.5;
    for (let y = -extent; y <= extent; y += stepY) {
      for (let x = -extent; x <= extent; x += stepX) {
        ctx.strokeText('EGZ · PRATINJAU', x, y);
        ctx.fillText('EGZ · PRATINJAU', x, y);
      }
    }
    ctx.resetTransform();
    ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(0, canvas.height - size * 2, canvas.width, size * 2);
    ctx.fillStyle = '#fff'; ctx.font = `600 ${Math.max(12, size * .7)}px system-ui, sans-serif`;
    ctx.fillText('Masuk untuk hasil asli', canvas.width / 2, canvas.height - size);
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Preview timeout')), 8000);
      canvas.toBlob(blob => {
        clearTimeout(timeout);
        if (blob) resolve(blob); else reject(new Error('Preview unavailable'));
      }, 'image/png');
    });
  } finally { image.close(); }
}
