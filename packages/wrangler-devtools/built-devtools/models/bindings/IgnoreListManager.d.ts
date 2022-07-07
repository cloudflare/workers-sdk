import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Workspace from '../workspace/workspace.js';
import type { DebuggerWorkspaceBinding } from './DebuggerWorkspaceBinding.js';
export declare class IgnoreListManager implements SDK.TargetManager.SDKModelObserver<SDK.DebuggerModel.DebuggerModel> {
    #private;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
        debuggerWorkspaceBinding: DebuggerWorkspaceBinding | null;
    }): IgnoreListManager;
    addChangeListener(listener: () => void): void;
    removeChangeListener(listener: () => void): void;
    modelAdded(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    modelRemoved(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    private clearCacheIfNeeded;
    private getSkipStackFramesPatternSetting;
    private setIgnoreListPatterns;
    isIgnoreListedUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): boolean;
    isIgnoreListedURL(url: Platform.DevToolsPath.UrlString, isContentScript?: boolean): boolean;
    private sourceMapAttached;
    private sourceMapDetached;
    private updateScriptRanges;
    private uiSourceCodeURL;
    canIgnoreListUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): boolean;
    ignoreListUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): void;
    unIgnoreListUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): void;
    ignoreListContentScripts(): void;
    unIgnoreListContentScripts(): void;
    private ignoreListURL;
    private unIgnoreListURL;
    private patternChanged;
    private patternChangeFinishedForTests;
    private urlToRegExpString;
}
export interface SourceRange {
    lineNumber: number;
    columnNumber: number;
}
