import SkeletonModel from '../../components/SkeletonModelCanvas/model/SkeletonModel';
import PhotoPoseLandmarks from '../../utils/PhotoPoseLandmarks';
import { featureBuffers } from '../feature/feature-buffers';
import { getNormal, getQuatDistance, getQuatFromForwardUp, getQuatMirrorX, isQuatZero, mid } from '../math';
import PoseMatcher, { FeatureBuffers, MatchResult } from './PoseMatcher';

const MAX_ERROR = Math.PI / 180 * 45;

export default class HandMatcher implements PoseMatcher {
    private isLeft: boolean;
    private cameraRelated: boolean;
    private rotation: [number, number, number, number] = [0, 0, 0, 0];

    constructor(isLeft: boolean, cameraRelated: boolean = true) {
        this.isLeft = isLeft;
        this.cameraRelated = cameraRelated;
    }

    prepare(model: SkeletonModel): void {
        const node = this.isLeft ? model.leftHand : model.rightHand;
        const up = getNormal([0, 0, 0], node.up);
        const forward = getNormal([0, 0, 0], node.forward);
        this.rotation = getQuatFromForwardUp(forward, up);
    }

    match(result: MatchResult, photo: PhotoPoseLandmarks, buffers: FeatureBuffers, index: number): void {
        const landmarks = photo.normalized;

        if (!this.cameraRelated) {
            result.scoreP = 0;
            result.scoreF = 0;
            result.accepted = true;
            result.score = 0;
            result.flipped = false;
            result.center = this.isLeft ? landmarks[15] : landmarks[16];
            result.related = this.isLeft ? [landmarks[17], landmarks[19], landmarks[21], landmarks[13]] : [landmarks[18], landmarks[20], landmarks[22], landmarks[14]];
            return;
        }

        const rotationL = featureBuffers.hand.getLeftHandRotation(buffers.hand, index);
        const rotationR = featureBuffers.hand.getRightHandRotation(buffers.hand, index);

        const rot = this.isLeft ? rotationL : rotationR;
        const rotMirror = this.isLeft ? rotationR : rotationL;

        let scoreP = -Infinity;
        let scoreF = -Infinity;

        if (!isQuatZero(rot)) {
            const errorP = getQuatDistance(this.rotation, rot);
            if (errorP <= MAX_ERROR) scoreP = Math.PI - errorP;
        }
        if (!isQuatZero(rotMirror)) {
            const errorF = getQuatDistance(this.rotation, getQuatMirrorX(rotMirror));
            if (errorF <= MAX_ERROR) scoreF = Math.PI - errorF;
        }

        result.scoreP = scoreP;
        result.scoreF = scoreF;
        result.accepted = isFinite(scoreP) || isFinite(scoreF);
        if (!result.accepted) return;

        if (scoreP >= scoreF) {
            result.score = scoreP;
            result.flipped = false;
            result.center = this.isLeft ? mid(landmarks[17], landmarks[19], landmarks[21]) : mid(landmarks[18], landmarks[20], landmarks[22]);
            result.related = this.isLeft ? [landmarks[15], landmarks[17], landmarks[19], landmarks[21], landmarks[13]] : [landmarks[16], landmarks[18], landmarks[20], landmarks[22], landmarks[14]];
        } else {
            result.score = scoreF;
            result.flipped = true;
            result.center = this.isLeft ? mid(landmarks[18], landmarks[20], landmarks[22]) : mid(landmarks[17], landmarks[19], landmarks[21]);
            result.related = this.isLeft ? [landmarks[16], landmarks[18], landmarks[20], landmarks[22], landmarks[14]] : [landmarks[15], landmarks[17], landmarks[19], landmarks[21], landmarks[13]];
        }
    }
}