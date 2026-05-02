import { quat, vec3 } from 'gl-matrix';
import SkeletonModel from '../../components/SkeletonModelCanvas/model/SkeletonModel';
import PhotoPoseLandmarks from '../../utils/PhotoPoseLandmarks';
import { featureBuffers } from '../feature/feature-buffers';
import PoseMatcher, { FeatureBuffers, MatchResult } from './PoseMatcher';
import FaceMatcher from './FaceMatcher';
import ChestMatcher from './ChestMatcher';
import ShoulderMatcher from './ShoulderMatcher';
import ElbowMatcher from './ElbowMatcher';
import CrotchMatcher from './CrotchMatcher';
import HipMatcher from './HipMatcher';
import KneeMatcher from './KneeMatcher';
import HandMatcher from './HandMatcher';
import FootMatcher from './FootMatcher';
import { mid } from '../math';

export default class CustomMatcher implements PoseMatcher {
    selectedJoints: string[];
    cameraRelated: boolean;

    private matchers: { [key: string]: PoseMatcher } = {};

    constructor(selectedJoints: string[], cameraRelated: boolean) {
        this.selectedJoints = selectedJoints;
        this.cameraRelated = cameraRelated;

        this.matchers = {
            'Face': new FaceMatcher(cameraRelated),
            'Chest': new ChestMatcher(cameraRelated),
            'Left Shoulder': new ShoulderMatcher(true, cameraRelated),
            'Right Shoulder': new ShoulderMatcher(false, cameraRelated),
            'Left Elbow': new ElbowMatcher(true, cameraRelated),
            'Right Elbow': new ElbowMatcher(false, cameraRelated),
            'Crotch': new CrotchMatcher(cameraRelated),
            'Left Hip': new HipMatcher(true, cameraRelated),
            'Right Hip': new HipMatcher(false, cameraRelated),
            'Left Knee': new KneeMatcher(true, cameraRelated),
            'Right Knee': new KneeMatcher(false, cameraRelated),
            'Left Hand': new HandMatcher(true, cameraRelated),
            'Right Hand': new HandMatcher(false, cameraRelated),
            'Left Foot': new FootMatcher(true, cameraRelated),
            'Right Foot': new FootMatcher(false, cameraRelated),
        };
    }

    prepare(model: SkeletonModel): void {
        for (const joint of this.selectedJoints) {
            if (this.matchers[joint]) {
                this.matchers[joint].prepare(model);
            }
        }
    }

    match(result: MatchResult, photo: PhotoPoseLandmarks, buffers: FeatureBuffers, index: number): void {
        if (this.selectedJoints.length === 0) {
            result.accepted = false;
            return;
        }
    
        let totalScoreP = 0;
        let totalScoreF = 0;
        let validP = true;
        let validF = true;
    
        const allRelated: [number, number, number][] = [];
        const allCenters: [number, number, number][] = [];
    
        for (const joint of this.selectedJoints) {
            const matcher = this.matchers[joint];
            if (!matcher) continue;
    
            const subResult: MatchResult = { score: 0, flipped: false, accepted: false, center: [0, 0, 0], related: [] };
            matcher.match(subResult, photo, buffers, index);
    
            if (!subResult.accepted) {
                validP = false;
                validF = false;
                break;
            }
    
            allRelated.push(...subResult.related);
            allCenters.push(subResult.center);
    
            const isLeftJoint = joint.includes('Left');
            const isRightJoint = joint.includes('Right');
    
            let scoreForP: number | undefined;
            let scoreForF: number | undefined;
    
            if (isLeftJoint) {
                scoreForP = subResult.scoreP;
                scoreForF = subResult.scoreF;
            } else if (isRightJoint) {
                scoreForP = subResult.scoreF;
                scoreForF = subResult.scoreP;
            } else { // Neutral
                scoreForP = subResult.scoreP;
                scoreForF = subResult.scoreF;
            }
    
            if (validP) {
                if (scoreForP !== undefined && isFinite(scoreForP)) {
                    totalScoreP += scoreForP;
                } else {
                    validP = false;
                }
            }
    
            if (validF) {
                if (scoreForF !== undefined && isFinite(scoreForF)) {
                    totalScoreF += scoreForF;
                } else {
                    validF = false;
                }
            }
    
            if (!validP && !validF) break;
        }
    
        if (!validP && !validF) {
            result.accepted = false;
            return;
        }
    
        result.accepted = true;
        if (validP && (!validF || totalScoreP >= totalScoreF)) {
            result.score = totalScoreP;
            result.flipped = false;
        } else if (validF) {
            result.score = totalScoreF;
            result.flipped = true;
        } else {
            result.accepted = false;
            return;
        }
    
        result.related = allRelated;
        if (allCenters.length > 0) {
            result.center = mid(...allCenters);
        }
    }
}