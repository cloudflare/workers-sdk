import * as SDK from '../../core/sdk/sdk.js';
import * as Bindings from '../../models/bindings/bindings.js';
import * as Workspace from '../../models/workspace/workspace.js';
import type { IssueKind } from './Issue.js';
import type { IssuesManager } from './IssuesManager.js';
export declare class SourceFrameIssuesManager {
    #private;
    private readonly issuesManager;
    constructor(issuesManager: IssuesManager);
}
export declare class IssueMessage extends Workspace.UISourceCode.Message {
    #private;
    constructor(title: string, kind: IssueKind, rawLocation: SDK.DebuggerModel.Location, locationPool: Bindings.LiveLocation.LiveLocationPool, clickHandler: () => void);
    getIssueKind(): IssueKind;
    dispose(): void;
}
