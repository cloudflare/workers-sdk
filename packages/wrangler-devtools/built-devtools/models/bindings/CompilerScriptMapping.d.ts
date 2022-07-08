import * as SDK from '../../core/sdk/sdk.js';
import type * as Platform from '../../core/platform/platform.js';
import * as Workspace from '../workspace/workspace.js';
import type { DebuggerSourceMapping, DebuggerWorkspaceBinding, RawLocationRange } from './DebuggerWorkspaceBinding.js';
export declare class CompilerScriptMapping implements DebuggerSourceMapping {
    #private;
    constructor(debuggerModel: SDK.DebuggerModel.DebuggerModel, workspace: Workspace.Workspace.WorkspaceImpl, debuggerWorkspaceBinding: DebuggerWorkspaceBinding);
    private onUiSourceCodeAdded;
    private addStubUISourceCode;
    private removeStubUISourceCode;
    static uiSourceCodeOrigin(uiSourceCode: Workspace.UISourceCode.UISourceCode): Platform.DevToolsPath.UrlString[];
    getLocationRangesForSameSourceLocation(rawLocation: SDK.DebuggerModel.Location): RawLocationRange[];
    uiSourceCodeForURL(url: Platform.DevToolsPath.UrlString, isContentScript: boolean): Workspace.UISourceCode.UISourceCode | null;
    rawLocationToUILocation(rawLocation: SDK.DebuggerModel.Location): Workspace.UISourceCode.UILocation | null;
    uiLocationToRawLocations(uiSourceCode: Workspace.UISourceCode.UISourceCode, lineNumber: number, columnNumber: number): SDK.DebuggerModel.Location[];
    private sourceMapWillAttach;
    private sourceMapFailedToAttach;
    private sourceMapAttached;
    private sourceMapDetached;
    sourceMapForScript(script: SDK.Script.Script): SDK.SourceMap.SourceMap | null;
    scriptsForUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): SDK.Script.Script[];
    private sourceMapAttachedForTest;
    private populateSourceMapSources;
    static uiLineHasMapping(uiSourceCode: Workspace.UISourceCode.UISourceCode, lineNumber: number): boolean;
    dispose(): void;
}
