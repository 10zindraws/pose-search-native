import SkeletonModel from '../../components/SkeletonModelCanvas/model/SkeletonModel';
import {angleBetweenVec3} from '../../utils/math/math';
import PhotoPoseLandmarks from '../../utils/PhotoPoseLandmarks';
import {featureBuffers} from '../feature/feature-buffers';
import {
    getNormal,
    getNormalInLocalSpace,
    getQuatDistance,
    getQuatFromRightUp,
    getQuatMirrorX,
    isQuatZero,
    isVecZero,
    mid
} from '../math';
import PoseMatcher, {FeatureBuffers, MatchResult} from './PoseMatcher';

const MAX_ERROR = Math.PI / 180 * 45;

export default class HipMatcher implements PoseMatcher {

    private isLeft: boolean;
    private cameraRelated: boolean;

    private thighLocalDir: [number, number, number] = [0, 0, 0];
    private thighLocalDirMirror: [number, number, number] = [0, 0, 0];
    private crotchRotation: [number, number, number, number] = [0, 0, 0, 1];

    constructor(isLeft: boolean, cameraRelated: boolean = true) {
        this.isLeft = isLeft;
        this.cameraRelated = cameraRelated;
    }

    prepare(model: SkeletonModel): void {
        if (this.isLeft) {
            this.thighLocalDir = getNormalInLocalSpace(
                model.rightThigh.originWorldPosition,
                model.leftThigh.originWorldPosition,
                model.trunk.originWorldPosition,
                model.trunk.controlPointWorldPosition,
                model.leftThigh.originWorldPosition,
                model.leftThigh.controlPointWorldPosition,
            );
            this.thighLocalDirMirror = getNormalInLocalSpace(
                model.rightThigh.originWorldPosition,
                model.leftThigh.originWorldPosition,
                model.trunk.originWorldPosition,
                model.trunk.controlPointWorldPosition,
                model.leftThigh.originWorldPosition,
                model.leftThigh.controlPointWorldPosition,
                true,
            );
        } else {
            this.thighLocalDir = getNormalInLocalSpace(
                model.leftThigh.originWorldPosition,
                model.rightThigh.originWorldPosition,
                model.trunk.originWorldPosition,
                model.trunk.controlPointWorldPosition,
                model.rightThigh.originWorldPosition,
                model.rightThigh.controlPointWorldPosition,
            );
            this.thighLocalDirMirror = getNormalInLocalSpace(
                model.leftThigh.originWorldPosition,
                model.rightThigh.originWorldPosition,
                model.trunk.originWorldPosition,
                model.trunk.controlPointWorldPosition,
                model.rightThigh.originWorldPosition,
                model.rightThigh.controlPointWorldPosition,
                true,
            );
        }

        const crotchUp = getNormal(
            mid(model.leftThigh.originViewPosition, model.rightThigh.originViewPosition),
            mid(model.leftUpperArm.originViewPosition, model.rightUpperArm.originViewPosition)
        );
        const crotchRight = getNormal(model.rightThigh.originViewPosition, model.leftThigh.originViewPosition);
        this.crotchRotation = getQuatFromRightUp(crotchRight, crotchUp);
    }

    match(result: MatchResult, photo: PhotoPoseLandmarks, buffers: FeatureBuffers, index: number): void {
        const crotchRotation = featureBuffers.crotch.getCrotchRotation(buffers.crotch, index);
        if (isQuatZero(crotchRotation)) {
            return;
        }

        const leftThighDir = featureBuffers.thigh.getLeftThighDir(buffers.thigh, index);
        const rightThighDir = featureBuffers.thigh.getRightThighDir(buffers.thigh, index);

        const thighErrL = angleBetweenVec3(leftThighDir, this.isLeft ? this.thighLocalDir : this.thighLocalDirMirror);
        const crotchErrL = getQuatDistance(this.crotchRotation, this.isLeft ? crotchRotation : getQuatMirrorX(crotchRotation));
        const thighErrR = angleBetweenVec3(rightThighDir, !this.isLeft ? this.thighLocalDir : this.thighLocalDirMirror);
        const crotchErrR = getQuatDistance(this.crotchRotation, !this.isLeft ? crotchRotation : getQuatMirrorX(crotchRotation));

        let scoreL = 0;
        if (this.cameraRelated) {
            scoreL = (Math.PI - thighErrL) * (Math.PI - crotchErrL);
        } else {
            scoreL = Math.PI - thighErrL;
        }

        let scoreR = 0;
        if (this.cameraRelated) {
            scoreR = (Math.PI - thighErrR) * (Math.PI - crotchErrR);
        } else {
            scoreR = Math.PI - thighErrR;
        }

        if (isVecZero(leftThighDir) || thighErrL > MAX_ERROR) {
            scoreL = -Infinity;
        } else if (this.cameraRelated && crotchErrL > MAX_ERROR) {
            scoreL = -Infinity;
        }

        if (isVecZero(rightThighDir) || thighErrR > MAX_ERROR) {
            scoreR = -Infinity;
        } else if (this.cameraRelated && crotchErrR > MAX_ERROR) {
            scoreR = -Infinity;
        }

        result.scoreP = scoreL;
        result.scoreF = scoreR;
        result.accepted = isFinite(scoreL) || isFinite(scoreR);
        if (!result.accepted) return;

        const landmarks = photo.normalized;
        if (isFinite(scoreL) && scoreL > scoreR) {
            result.score = scoreL;
            result.flipped = !this.isLeft;
            result.center = landmarks[23];
            result.related = [landmarks[24], landmarks[25], mid(landmarks[23], landmarks[11])];
        } else if (isFinite(scoreR)) {
            result.score = scoreR;
            result.flipped = this.isLeft;
            result.center = landmarks[24];
            result.related = [landmarks[23], landmarks[26], mid(landmarks[24], landmarks[12])];
        }
    }

}
