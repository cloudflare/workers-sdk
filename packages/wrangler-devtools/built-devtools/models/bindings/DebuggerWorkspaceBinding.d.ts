import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import type * as Workspace from '../workspace/workspace.js';
import { DebuggerLanguagePluginManager } from './DebuggerLanguagePlugins.js';
import type { LiveLocation, LiveLocationPool } from './LiveLocation.js';
import { LiveLocationWithPool } from './LiveLocation.js';
import type { ResourceScriptFile } from './ResourceScriptMapping.js';
export declare class DebuggerWorkspaceBinding implements SDK.TargetManager.SDKModelObserver<SDK.DebuggerModel.DebuggerModel> {
    #private;
    readonly workspace: Workspace.Workspace.WorkspaceImpl;
    pluginManager: DebuggerLanguagePluginManager | null;
    private constructor();
    initPluginManagerForTest(): DebuggerLanguagePluginManager | null;
    static instance(opts?: {
        forceNew: boolean | null;
        targetManager: SDK.TargetManager.TargetManager | null;
        workspace: Workspace.Workspace.WorkspaceImpl | null;
    }): DebuggerWorkspaceBinding;
    static removeInstance(): void;
    addSourceMapping(sourceMapping: DebuggerSourceMapping): void;
    removeSourceMapping(sourceMapping: DebuggerSourceMapping): void;
    private computeAutoStepRanges;
    modelAdded(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    modelRemoved(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    /**
     * The promise returned by this function is resolved once all *currently*
     * pending LiveLocations are processed.
     */
    pendingLiveLocationChangesPromise(): Promise<void | Location | StackTraceTopFrameLocation | null>;
    private recordLiveLocationChange;
    updateLocations(script: SDK.Script.Script): Promise<void>;
    createLiveLocation(rawLocation: SDK.DebuggerModel.Location, updateDelegate: (arg0: LiveLocation) => Promise<void>, locationPool: LiveLocationPool): Promise<Location | null>;
    createStackTraceTopFrameLiveLocation(rawLocations: SDK.DebuggerModel.Location[], updateDelegate: (arg0: LiveLocation) => Promise<void>, locationPool: LiveLocationPool): Promise<LiveLocation>;
    createCallFrameLiveLocation(location: SDK.DebuggerModel.Location, updateDelegate: (arg0: LiveLocation) => Promise<void>, locationPool: LiveLocationPool): Promise<Location | null>;
    rawLocationToUILocation(rawLocation: SDK.DebuggerModel.Location): Promise<Workspace.UISourceCode.UILocation | null>;
    uiSourceCodeForSourceMapSourceURL(debuggerModel: SDK.DebuggerModel.DebuggerModel, url: Platform.DevToolsPath.UrlString, isContentScript: boolean): Workspace.UISourceCode.UISourceCode | null;
    uiLocationToRawLocations(uiSourceCode: Workspace.UISourceCode.UISourceCode, lineNumber: number, columnNumber?: number): Promise<SDK.DebuggerModel.Location[]>;
    uiLocationToRawLocationsForUnformattedJavaScript(uiSourceCode: Workspace.UISourceCode.UISourceCode, lineNumber: number, columnNumber: number): SDK.DebuggerModel.Location[];
    normalizeUILocation(uiLocation: Workspace.UISourceCode.UILocation): Promise<Workspace.UISourceCode.UILocation>;
    scriptFile(uiSourceCode: Workspace.UISourceCode.UISourceCode, debuggerModel: SDK.DebuggerModel.DebuggerModel): ResourceScriptFile | null;
    scriptsForUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): SDK.Script.Script[];
    scriptsForResource(uiSourceCode: Workspace.UISourceCode.UISourceCode): SDK.Script.Script[];
    supportsConditionalBreakpoints(uiSourceCode: Workspace.UISourceCode.UISourceCode): boolean;
    sourceMapForScript(script: SDK.Script.Script): SDK.SourceMap.SourceMap | null;
    private globalObjectCleared;
    private reset;
    resetForTest(target: SDK.Target.Target): void;
    private registerCallFrameLiveLocation;
    removeLiveLocation(location: Location): void;
    private debuggerResumed;
}
export declare class Location extends LiveLocationWithPool {
    #private;
    readonly scriptId: string;
    readonly rawLocation: SDK.DebuggerModel.Location;
    constructor(scriptId: string, rawLocation: SDK.DebuggerModel.Location, binding: DebuggerWorkspaceBinding, updateDelegate: (arg0: LiveLocation) => Promise<void>, locationPool: LiveLocationPool);
    uiLocation(): Promise<Workspace.UISourceCode.UILocation | null>;
    dispose(): void;
    isIgnoreListed(): Promise<boolean>;
}
declare class StackTraceTopFrameLocation extends LiveLocationWithPool {
    #private;
    constructor(updateDelegate: (arg0: LiveLocation) => Promise<void>, locationPool: LiveLocationPool);
    static createStackTraceTopFrameLocation(rawLocations: SDK.DebuggerModel.Location[], binding: DebuggerWorkspaceBinding, updateDelegate: (arg0: LiveLocation) => Promise<void>, locationPool: LiveLocationPool): Promise<StackTraceTopFrameLocation>;
    uiLocation(): Promise<Workspace.UISourceCode.UILocation | null>;
    isIgnoreListed(): Promise<boolean>;
    dispose(): void;
    private scheduleUpdate;
    private updateLocation;
}
export interface RawLocationRange {
    start: SDK.DebuggerModel.Location;
    end: SDK.DebuggerModel.Location;
}
export interface DebuggerSourceMapping {
    rawLocationToUILocation(rawLocation: SDK.DebuggerModel.Location): Workspace.UISourceCode.UILocation | null;
    uiLocationToRawLocations(uiSourceCode: Workspace.UISourceCode.UISourceCode, lineNumber: number, columnNumber?: number): SDK.DebuggerModel.Location[];
}
export {};
