import PhotoPoseLandmarks from '../../utils/PhotoPoseLandmarks';
import { EXTREMITY_VISIBILITY_ACCEPTABLE_THRESHOLD } from '../constants';
import {
    getNormal,
    getQuatFromForwardUp,
    mid,
    normalizedLandmarkToViewSpace,
    avg
} from '../math';
import { getVerticalInDir } from '../../utils/math/math';
import FeatureBuffer from './FeatureBuffer';

const BUFFER_STEP = 8;

export default class HandFeatureBuffer implements FeatureBuffer {
    filename: string = 'hand';

    create(chunk: PhotoPoseLandmarks[]): Float32Array {
        const buffer = new Float32Array(BUFFER_STEP * chunk.length);
        for (let i = 0, len = chunk.length; i < len; ++i) {
            const photo = chunk[i];
            const normalized = photo.normalized;
            const visibility = photo.visibility;
            const aspect = photo.width / photo.height;
            const offset = i * BUFFER_STEP;

            const confL = avg(visibility[15], visibility[17], visibility[19], visibility[21]);
            if (confL >= EXTREMITY_VISIBILITY_ACCEPTABLE_THRESHOLD) {
                const wrist = normalizedLandmarkToViewSpace(normalized[15], aspect);
                const pinky = normalizedLandmarkToViewSpace(normalized[17], aspect);
                const index = normalizedLandmarkToViewSpace(normalized[19], aspect);
                const thumb = normalizedLandmarkToViewSpace(normalized[21], aspect);

                const up = getNormal(mid(pinky, index), wrist);
                const forward = getVerticalInDir([0, 0, 0], up, [thumb[0] - wrist[0], thumb[1] - wrist[1], thumb[2] - wrist[2]]) as [number, number, number];
                const rotation = getQuatFromForwardUp(forward, up);
                buffer[offset + 0] = rotation[0];
                buffer[offset + 1] = rotation[1];
                buffer[offset + 2] = rotation[2];
                buffer[offset + 3] = rotation[3];
            }

            const confR = avg(visibility[16], visibility[18], visibility[20], visibility[22]);
            if (confR >= EXTREMITY_VISIBILITY_ACCEPTABLE_THRESHOLD) {
                const wrist = normalizedLandmarkToViewSpace(normalized[16], aspect);
                const pinky = normalizedLandmarkToViewSpace(normalized[18], aspect);
                const index = normalizedLandmarkToViewSpace(normalized[20], aspect);
                const thumb = normalizedLandmarkToViewSpace(normalized[22], aspect);

                const up = getNormal(mid(pinky, index), wrist);
                const forward = getVerticalInDir([0, 0, 0], up,[thumb[0] - wrist[0], thumb[1] - wrist[1], thumb[2] - wrist[2]]) as [number, number, number];
                const rotation = getQuatFromForwardUp(forward, up);
                buffer[offset + 4] = rotation[0];
                buffer[offset + 5] = rotation[1];
                buffer[offset + 6] = rotation[2];
                buffer[offset + 7] = rotation[3];
            }
        }
        return buffer;
    }

    getLeftHandRotation(buffer: Float32Array, i: number): [number, number, number, number] {
        const offset = i * BUFFER_STEP;
        return [buffer[offset + 0], buffer[offset + 1], buffer[offset + 2], buffer[offset + 3]];
    }

    getRightHandRotation(buffer: Float32Array, i: number):[number, number, number, number] {
        const offset = i * BUFFER_STEP;
        return[buffer[offset + 4], buffer[offset + 5], buffer[offset + 6], buffer[offset + 7]];
    }
}