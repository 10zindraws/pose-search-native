import PhotoPoseLandmarks from '../../utils/PhotoPoseLandmarks';
import { EXTREMITY_VISIBILITY_ACCEPTABLE_THRESHOLD } from '../constants';
import {
    getNormal,
    getQuatFromForwardUp,
    normalizedLandmarkToViewSpace,
    avg
} from '../math';
import { getVerticalInDir } from '../../utils/math/math';
import FeatureBuffer from './FeatureBuffer';

const BUFFER_STEP = 8;

export default class FootFeatureBuffer implements FeatureBuffer {
    filename: string = 'foot';

    create(chunk: PhotoPoseLandmarks[]): Float32Array {
        const buffer = new Float32Array(BUFFER_STEP * chunk.length);
        for (let i = 0, len = chunk.length; i < len; ++i) {
            const photo = chunk[i];
            const normalized = photo.normalized;
            const visibility = photo.visibility;
            const aspect = photo.width / photo.height;
            const offset = i * BUFFER_STEP;

            const confL = avg(visibility[27], visibility[29], visibility[31]);
            if (confL >= EXTREMITY_VISIBILITY_ACCEPTABLE_THRESHOLD) {
                const ankle = normalizedLandmarkToViewSpace(normalized[27], aspect);
                const heel = normalizedLandmarkToViewSpace(normalized[29], aspect);
                const index = normalizedLandmarkToViewSpace(normalized[31], aspect);

                const forward = getNormal(heel, index);
                const up = getVerticalInDir([0, 0, 0], forward, [ankle[0] - index[0], ankle[1] - index[1], ankle[2] - index[2]]) as [number, number, number];
                const rotation = getQuatFromForwardUp(forward, up);
                buffer[offset + 0] = rotation[0];
                buffer[offset + 1] = rotation[1];
                buffer[offset + 2] = rotation[2];
                buffer[offset + 3] = rotation[3];
            }

            const confR = avg(visibility[28], visibility[30], visibility[32]);
            if (confR >= EXTREMITY_VISIBILITY_ACCEPTABLE_THRESHOLD) {
                const ankle = normalizedLandmarkToViewSpace(normalized[28], aspect);
                const heel = normalizedLandmarkToViewSpace(normalized[30], aspect);
                const index = normalizedLandmarkToViewSpace(normalized[32], aspect);

                const forward = getNormal(heel, index);
                const up = getVerticalInDir([0, 0, 0], forward, [ankle[0] - index[0], ankle[1] - index[1], ankle[2] - index[2]]) as [number, number, number];
                const rotation = getQuatFromForwardUp(forward, up);
                buffer[offset + 4] = rotation[0];
                buffer[offset + 5] = rotation[1];
                buffer[offset + 6] = rotation[2];
                buffer[offset + 7] = rotation[3];
            }
        }
        return buffer;
    }

    getLeftFootRotation(buffer: Float32Array, i: number): [number, number, number, number] {
        const offset = i * BUFFER_STEP;
        return [buffer[offset + 0], buffer[offset + 1], buffer[offset + 2], buffer[offset + 3]];
    }

    getRightFootRotation(buffer: Float32Array, i: number): [number, number, number, number] {
        const offset = i * BUFFER_STEP;
        return [buffer[offset + 4], buffer[offset + 5], buffer[offset + 6], buffer[offset + 7]];
    }
}