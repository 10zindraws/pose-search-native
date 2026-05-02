const POSE_CONFIG = {
    locateFile(path, prefix) {
        return '/assets/@mediapipe/pose/' + path;
    }
};
self.createMediapipeSolutionsWasm = POSE_CONFIG;
self.createMediapipeSolutionsPackedAssets = POSE_CONFIG;
importScripts(
    '/assets/@mediapipe/pose/pose.js',
    '/assets/@mediapipe/pose/pose_solution_packed_assets_loader.js',
    '/assets/@mediapipe/pose/pose_solution_simd_wasm_bin.js',
);

(function () {
    let pose;
    let detectPoseResults;
    self.onmessage = async function (e) {
        try {
            if (!pose) {
                pose = new Pose(POSE_CONFIG);
                pose.setOptions({
                    selfieMode: false,
                    modelComplexity: 2,
                    smoothLandmarks: false,
					useCpuInference: true
                });

                const solution = pose.g;
                const solutionConfig = solution.g;
                solutionConfig.files = () =>[];
                await pose.initialize();
                solution.D = solution.h.GL.currentContext.GLctx;

                const files = solution.F;
                files['pose_landmark_heavy.tflite'] = (await fetch('/assets/@mediapipe/pose/pose_landmark_heavy.tflite')).arrayBuffer();
                files['pose_web.binarypb'] = (await fetch('/assets/@mediapipe/pose/pose_web.binarypb')).arrayBuffer();

                pose.onResults(function onResults(results) {
                    detectPoseResults = {
                        normalizedLandmarks: results?.poseLandmarks?.map(landmark => ({
                            point: [landmark.x, landmark.y, -landmark.z], visibility: landmark.visibility || 0
                        })) ||[],
                        worldLandmarks: results?.poseWorldLandmarks?.map(landmark => ({
                            point: [landmark.x, -landmark.y, -landmark.z], visibility: landmark.visibility || 0
                        })) ||[],
                    };
                });
            }
            pose.reset();
            const bitmap = e.data;
            
            try {
                // CRITICAL FIX: Reset state before send. If no pose is found, onResults won't fire.
                detectPoseResults = null; 
                await pose.send({image: bitmap});
            } finally {
                // CRITICAL FIX: Close the ImageBitmap to prevent memory leaks and worker crashes
                if (bitmap && bitmap.close) {
                    bitmap.close();
                }
            }
            
        } catch (e) {
            detectPoseResults = null;
        }
        postMessage(detectPoseResults);
    };
})();