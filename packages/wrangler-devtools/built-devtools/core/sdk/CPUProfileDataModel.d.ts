import type * as Protocol from '../../generated/protocol.js';
import { ProfileNode, ProfileTreeModel } from './ProfileTreeModel.js';
import type { Target } from './Target.js';
export declare class CPUProfileNode extends ProfileNode {
    id: number;
    self: number;
    positionTicks: Protocol.Profiler.PositionTickInfo[] | undefined;
    deoptReason: string | null;
    constructor(node: Protocol.Profiler.ProfileNode, sampleTime: number);
}
export declare class CPUProfileDataModel extends ProfileTreeModel {
    #private;
    profileStartTime: number;
    profileEndTime: number;
    timestamps: number[];
    samples: number[] | undefined;
    lines: any;
    totalHitCount: number;
    profileHead: CPUProfileNode;
    gcNode: CPUProfileNode;
    programNode?: ProfileNode;
    idleNode?: ProfileNode;
    constructor(profile: Protocol.Profiler.Profile, target: Target | null);
    private compatibilityConversionHeadToNodes;
    private convertTimeDeltas;
    private translateProfileTree;
    private sortSamples;
    private normalizeTimestamps;
    private buildIdToNodeMap;
    private extractMetaNodes;
    private fixMissingSamples;
    forEachFrame(openFrameCallback: (arg0: number, arg1: CPUProfileNode, arg2: number) => void, closeFrameCallback: (arg0: number, arg1: CPUProfileNode, arg2: number, arg3: number, arg4: number) => void, startTime?: number, stopTime?: number): void;
    nodeByIndex(index: number): CPUProfileNode | null;
}
