import * as SDK from '../../core/sdk/sdk.js';
import * as Workspace from '../workspace/workspace.js';
import type { SourceMapping } from './CSSWorkspaceBinding.js';
export declare class SASSSourceMapping implements SourceMapping {
    #private;
    constructor(target: SDK.Target.Target, sourceMapManager: SDK.SourceMapManager.SourceMapManager<SDK.CSSStyleSheetHeader.CSSStyleSheetHeader>, workspace: Workspace.Workspace.WorkspaceImpl);
    private sourceMapAttachedForTest;
    private sourceMapAttached;
    private sourceMapDetached;
    rawLocationToUILocation(rawLocation: SDK.CSSModel.CSSLocation): Workspace.UISourceCode.UILocation | null;
    uiLocationToRawLocations(uiLocation: Workspace.UISourceCode.UILocation): SDK.CSSModel.CSSLocation[];
    dispose(): void;
}
