// These are preferences, not promises about hardware performance.
export function deviceProfile({ compact = false, cores = 8, memory = 8 } = {}) {
  const light = compact || cores <= 4 || memory <= 4;
  return {
    name: light ? 'hemat' : 'desktop',
    video: { width: { ideal: light ? 960 : 1280 }, height: { ideal: light ? 540 : 720 },
      frameRate: { ideal: light ? 24 : 30, max: 30 }, facingMode: 'user' },
    inferenceInterval: light ? 100 : 50,
    inferenceWidth: light ? 480 : 640,
  };
}
