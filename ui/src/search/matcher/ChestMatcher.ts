import SkeletonModel from '../../components/SkeletonModelCanvas/model/SkeletonModel';
import PhotoPoseLandmarks from '../../utils/PhotoPoseLandmarks';
import {featureBuffers} from '../feature/feature-buffers';
import {getNormal, getQuatDistance, getQuatFromRightUp, getQuatMirrorX, isQuatZero, mid} from '../math';
import PoseMatcher, {FeatureBuffers, MatchResult} from './PoseMatcher';

const MAX_ERROR = Math.PI / 180 * 45;

export default class ChestMatcher implements PoseMatcher {

    private cameraRelated: boolean;
    private rotation: [number, number, number, number] =[0, 0, 0, 0];

    constructor(cameraRelated: boolean = true) {
        this.cameraRelated = cameraRelated;
    }

    prepare(model: SkeletonModel): void {
        const up = getNormal(
            mid(model.leftThigh.originViewPosition, model.rightThigh.originViewPosition),
            mid(model.leftUpperArm.originViewPosition, model.rightUpperArm.originViewPosition)
        );
        const right = getNormal(model.rightUpperArm.originViewPosition, model.leftUpperArm.originViewPosition);
        this.rotation = getQuatFromRightUp(right, up);
    }

    match(result: MatchResult, photo: PhotoPoseLandmarks, buffers: FeatureBuffers, index: number): void {
        const landmarks = photo.normalized;
        result.center = mid(landmarks[11], landmarks[12]);
        result.related = [
            landmarks[11],
            landmarks[12],
            landmarks[13],
            landmarks[14],
            mid(
                landmarks[24],
                landmarks[23],
                landmarks[12],
                landmarks[11]
            )
        ];

        if (!this.cameraRelated) {
            result.scoreP = 0;
            result.scoreF = 0;
            result.accepted = true;
            result.score = 0;
            result.flipped = false;
            return;
        }

        const rotation = featureBuffers.chest.getChestRotation(buffers.chest, index);
        if (isQuatZero(rotation)) {
            result.accepted = false;
            return;
        }
        const errorP = getQuatDistance(this.rotation, rotation);
        const errorF = getQuatDistance(this.rotation, getQuatMirrorX(rotation));
        
        const scoreP = Math.PI - errorP;
        const scoreF = Math.PI - errorF;
        result.scoreP = errorP <= MAX_ERROR ? scoreP : -Infinity;
        result.scoreF = errorF <= MAX_ERROR ? scoreF : -Infinity;
        result.accepted = result.scoreP !== -Infinity || result.scoreF !== -Infinity;
        if (!result.accepted) return;

        if (scoreP > scoreF) {
            result.score = scoreP;
            result.flipped = false;
        } else {
            result.score = scoreF;
            result.flipped = true;
        }
    }

}
