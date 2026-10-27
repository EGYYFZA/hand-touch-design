import { HandLandmarker, FaceLandmarker, FilesetResolver } from './vendor/vision_bundle.mjs';

// ES modules are cached; each task still needs its own Emscripten factory.
self.import = async url => { self.ModuleFactory = (await import(url)).default; };

let hands, face, files, faceFailed = false;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      files = await FilesetResolver.forVisionTasks(new URL('./vendor/wasm', self.location.href).href, true);
      hands = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: new URL('./models/hand_landmarker.task', self.location.href).href, delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.6, minTrackingConfidence: 0.5,
      });
      self.postMessage({ type: 'ready' });
    } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
    return;
  }
  if (data.type !== 'frame') return;
  try {
    if (!data.face) faceFailed = false;
    if (data.face && !face && !faceFailed) {
      try {
        face = await FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: new URL('./models/face_landmarker.task', self.location.href).href, delegate: 'CPU' },
          runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
        });
      } catch (error) { faceFailed = true; self.postMessage({ type: 'face-error', message: error.message }); }
    }
    const result = hands.detectForVideo(data.image, data.timestamp);
    const expression = data.face && face ? face.detectForVideo(data.image, data.timestamp) : null;
    self.postMessage({ type: 'result', landmarks: result.landmarks,
      face: expression?.faceLandmarks?.[0] || null,
      shapes: expression?.faceBlendshapes?.[0]?.categories || [], timestamp: data.timestamp, mode: data.mode });
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
  finally { data.image.close(); }
};
