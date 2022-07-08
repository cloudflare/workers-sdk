import type * as Protocol from '../../generated/protocol.js';
import type * as Platform from '../platform/platform.js';
import type { Target } from './Target.js';
export declare class ProfileNode {
    callFrame: Protocol.Runtime.CallFrame;
    callUID: string;
    self: number;
    total: number;
    id: number;
    parent: ProfileNode | null;
    children: ProfileNode[];
    depth: number;
    deoptReason: string | null;
    constructor(callFrame: Protocol.Runtime.CallFrame);
    get functionName(): string;
    get scriptId(): Protocol.Runtime.ScriptId;
    get url(): Platform.DevToolsPath.UrlString;
    get lineNumber(): number;
    get columnNumber(): number;
}
export declare class ProfileTreeModel {
    #private;
    root: ProfileNode;
    total: number;
    maxDepth: number;
    constructor(target?: Target | null);
    initialize(root: ProfileNode): void;
    private assignDepthsAndParents;
    private calculateTotals;
    target(): Target | null;
}
