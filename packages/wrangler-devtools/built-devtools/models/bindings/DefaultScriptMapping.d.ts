import type * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Workspace from '../workspace/workspace.js';
import type { DebuggerSourceMapping, DebuggerWorkspaceBinding } from './DebuggerWorkspaceBinding.js';
export declare class DefaultScriptMapping implements DebuggerSourceMapping {
    #private;
    constructor(debuggerModel: SDK.DebuggerModel.DebuggerModel, workspace: Workspace.Workspace.WorkspaceImpl, debuggerWorkspaceBinding: DebuggerWorkspaceBinding);
    static createV8ScriptURL(script: SDK.Script.Script): Platform.DevToolsPath.UrlString;
    static scriptForUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): SDK.Script.Script | null;
    rawLocationToUILocation(rawLocation: SDK.DebuggerModel.Location): Workspace.UISourceCode.UILocation | null;
    uiLocationToRawLocations(uiSourceCode: Workspace.UISourceCode.UISourceCode, lineNumber: number, columnNumber: number): SDK.DebuggerModel.Location[];
    private parsedScriptSource;
    private discardedScriptSource;
    private debuggerReset;
    dispose(): void;
}
