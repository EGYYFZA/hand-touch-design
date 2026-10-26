import { HandLandmarker, FaceLandmarker, FilesetResolver } from './vendor/vision_bundle.mjs';

// ES modules are cached; each task still needs its own Emscripten factory.
self.import = async url => { self.ModuleFactory = (await import(url)).default; };

let hands, face;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const files = await FilesetResolver.forVisionTasks(new URL('./vendor/wasm', self.location.href).href, true);
      hands = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: new URL('./models/hand_landmarker.task', self.location.href).href, delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.6, minTrackingConfidence: 0.5,
      });
      face = await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: new URL('./models/face_landmarker.task', self.location.href).href, delegate: 'CPU' },
        runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
      });
      self.postMessage({ type: 'ready' });
    } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
    return;
  }
  if (data.type !== 'frame') return;
  try {
    const result = hands.detectForVideo(data.image, data.timestamp);
    const expression = data.face ? face.detectForVideo(data.image, data.timestamp) : null;
    self.postMessage({ type: 'result', landmarks: result.landmarks,
      face: expression?.faceLandmarks?.[0] || null,
      shapes: expression?.faceBlendshapes?.[0]?.categories || [], timestamp: data.timestamp });
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
  finally { data.image.close(); }
};
