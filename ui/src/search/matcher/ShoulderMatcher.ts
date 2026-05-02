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

export default class ShoulderMatcher implements PoseMatcher {

    private isLeft: boolean;
    private cameraRelated: boolean;

    private shoulderLocalDir: [number, number, number] = [0, 0, 0];
    private shoulderLocalDirMirror: [number, number, number] = [0, 0, 0];
    private chestRotation: [number, number, number, number] = [0, 0, 0, 1];

    constructor(isLeft: boolean, cameraRelated: boolean = true) {
        this.isLeft = isLeft;
        this.cameraRelated = cameraRelated;
    }

    prepare(model: SkeletonModel): void {
        if (this.isLeft) {
            this.shoulderLocalDir = getNormalInLocalSpace(
                model.rightUpperArm.originWorldPosition,
                model.leftUpperArm.originWorldPosition,
                model.trunk.originWorldPosition,
                model.trunk.controlPointWorldPosition,
                model.leftUpperArm.originWorldPosition,
                model.leftUpperArm.controlPointWorldPosition,
            );
            this.shoulderLocalDirMirror = getNormalInLocalSpace(
                model.rightUpperArm.originWorldPosition,
                model.leftUpperArm.originWorldPosition,
                model.trunk.originWorldPosition,
                model.trunk.controlPointWorldPosition,
                model.leftUpperArm.originWorldPosition,
                model.leftUpperArm.controlPointWorldPosition,
                true,
            );
        } else {
            this.shoulderLocalDir = getNormalInLocalSpace(
                model.leftUpperArm.originWorldPosition,
                model.rightUpperArm.originWorldPosition,
                model.trunk.originWorldPosition,
                model.trunk.controlPointWorldPosition,
                model.rightUpperArm.originWorldPosition,
                model.rightUpperArm.controlPointWorldPosition,
            );
            this.shoulderLocalDirMirror = getNormalInLocalSpace(
                model.leftUpperArm.originWorldPosition,
                model.rightUpperArm.originWorldPosition,
                model.trunk.originWorldPosition,
                model.trunk.controlPointWorldPosition,
                model.rightUpperArm.originWorldPosition,
                model.rightUpperArm.controlPointWorldPosition,
                true,
            );
        }

        const chestUp = getNormal(
            mid(model.leftThigh.originViewPosition, model.rightThigh.originViewPosition),
            mid(model.leftUpperArm.originViewPosition, model.rightUpperArm.originViewPosition)
        );
        const chestRight = getNormal(model.rightUpperArm.originViewPosition, model.leftUpperArm.originViewPosition);
        this.chestRotation = getQuatFromRightUp(chestRight, chestUp);
    }

    match(result: MatchResult, photo: PhotoPoseLandmarks, buffers: FeatureBuffers, index: number): void {
        const chestRotation = featureBuffers.chest.getChestRotation(buffers.chest, index);
        if (isQuatZero(chestRotation)) {
            return;
        }

        const leftUpperArmDir = featureBuffers.upperArm.getLeftUpperArmDir(buffers.upperArm, index);
        const rightUpperArmDir = featureBuffers.upperArm.getRightUpperArmDir(buffers.upperArm, index);

        const shoulderErrL = angleBetweenVec3(leftUpperArmDir, this.isLeft ? this.shoulderLocalDir : this.shoulderLocalDirMirror);
        const chestErrL = getQuatDistance(this.chestRotation, this.isLeft ? chestRotation : getQuatMirrorX(chestRotation));
        const shoulderErrR = angleBetweenVec3(rightUpperArmDir, !this.isLeft ? this.shoulderLocalDir : this.shoulderLocalDirMirror);
        const chestErrR = getQuatDistance(this.chestRotation, !this.isLeft ? chestRotation : getQuatMirrorX(chestRotation));

        let scoreL = 0;
        if (this.cameraRelated) {
            scoreL = (Math.PI - shoulderErrL) * (Math.PI - chestErrL);
        } else {
            scoreL = Math.PI - shoulderErrL;
        }

        let scoreR = 0;
        if (this.cameraRelated) {
            scoreR = (Math.PI - shoulderErrR) * (Math.PI - chestErrR);
        } else {
            scoreR = Math.PI - shoulderErrR;
        }

        if (isVecZero(leftUpperArmDir) || shoulderErrL > MAX_ERROR) {
            scoreL = -Infinity;
        } else if (this.cameraRelated && chestErrL > MAX_ERROR) {
            scoreL = -Infinity;
        }

        if (isVecZero(rightUpperArmDir) || shoulderErrR > MAX_ERROR) {
            scoreR = -Infinity;
        } else if (this.cameraRelated && chestErrR > MAX_ERROR) {
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
            result.center = landmarks[11];
            result.related = [landmarks[12], landmarks[13], mid(landmarks[23], landmarks[11])];
        } else if (isFinite(scoreR)) {
            result.score = scoreR;
            result.flipped = this.isLeft;
            result.center = landmarks[12];
            result.related = [landmarks[11], landmarks[14], mid(landmarks[24], landmarks[12])];
        }
    }

}
