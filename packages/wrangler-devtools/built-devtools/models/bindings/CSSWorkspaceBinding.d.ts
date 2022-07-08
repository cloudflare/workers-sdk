import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import type * as Workspace from '../workspace/workspace.js';
import type { LiveLocation as LiveLocationInterface, LiveLocationPool } from './LiveLocation.js';
import { LiveLocationWithPool } from './LiveLocation.js';
export declare class CSSWorkspaceBinding implements SDK.TargetManager.SDKModelObserver<SDK.CSSModel.CSSModel> {
    #private;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
        targetManager: SDK.TargetManager.TargetManager | null;
        workspace: Workspace.Workspace.WorkspaceImpl | null;
    }): CSSWorkspaceBinding;
    static removeInstance(): void;
    get modelToInfo(): Map<SDK.CSSModel.CSSModel, ModelInfo>;
    private getCSSModelInfo;
    modelAdded(cssModel: SDK.CSSModel.CSSModel): void;
    modelRemoved(cssModel: SDK.CSSModel.CSSModel): void;
    /**
     * The promise returned by this function is resolved once all *currently*
     * pending LiveLocations are processed.
     */
    pendingLiveLocationChangesPromise(): Promise<void>;
    private recordLiveLocationChange;
    updateLocations(header: SDK.CSSStyleSheetHeader.CSSStyleSheetHeader): Promise<void>;
    createLiveLocation(rawLocation: SDK.CSSModel.CSSLocation, updateDelegate: (arg0: LiveLocationInterface) => Promise<void>, locationPool: LiveLocationPool): Promise<LiveLocation>;
    propertyRawLocation(cssProperty: SDK.CSSProperty.CSSProperty, forName: boolean): SDK.CSSModel.CSSLocation | null;
    propertyUILocation(cssProperty: SDK.CSSProperty.CSSProperty, forName: boolean): Workspace.UISourceCode.UILocation | null;
    rawLocationToUILocation(rawLocation: SDK.CSSModel.CSSLocation): Workspace.UISourceCode.UILocation | null;
    uiLocationToRawLocations(uiLocation: Workspace.UISourceCode.UILocation): SDK.CSSModel.CSSLocation[];
    addSourceMapping(sourceMapping: SourceMapping): void;
    removeSourceMapping(sourceMapping: SourceMapping): void;
}
export interface SourceMapping {
    rawLocationToUILocation(rawLocation: SDK.CSSModel.CSSLocation): Workspace.UISourceCode.UILocation | null;
    uiLocationToRawLocations(uiLocation: Workspace.UISourceCode.UILocation): SDK.CSSModel.CSSLocation[];
}
export declare class ModelInfo {
    #private;
    constructor(cssModel: SDK.CSSModel.CSSModel, workspace: Workspace.Workspace.WorkspaceImpl);
    get locations(): Platform.MapUtilities.Multimap<SDK.CSSStyleSheetHeader.CSSStyleSheetHeader, LiveLocation>;
    createLiveLocation(rawLocation: SDK.CSSModel.CSSLocation, updateDelegate: (arg0: LiveLocationInterface) => Promise<void>, locationPool: LiveLocationPool): Promise<LiveLocation>;
    disposeLocation(location: LiveLocation): void;
    updateLocations(header: SDK.CSSStyleSheetHeader.CSSStyleSheetHeader): Promise<void[]>;
    private styleSheetAdded;
    private styleSheetRemoved;
    rawLocationToUILocation(rawLocation: SDK.CSSModel.CSSLocation): Workspace.UISourceCode.UILocation | null;
    uiLocationToRawLocations(uiLocation: Workspace.UISourceCode.UILocation): SDK.CSSModel.CSSLocation[];
    dispose(): void;
}
export declare class LiveLocation extends LiveLocationWithPool {
    #private;
    readonly url: Platform.DevToolsPath.UrlString;
    headerInternal: SDK.CSSStyleSheetHeader.CSSStyleSheetHeader | null;
    constructor(rawLocation: SDK.CSSModel.CSSLocation, info: ModelInfo, updateDelegate: (arg0: LiveLocationInterface) => Promise<void>, locationPool: LiveLocationPool);
    header(): SDK.CSSStyleSheetHeader.CSSStyleSheetHeader | null;
    setHeader(header: SDK.CSSStyleSheetHeader.CSSStyleSheetHeader | null): void;
    uiLocation(): Promise<Workspace.UISourceCode.UILocation | null>;
    dispose(): void;
    isIgnoreListed(): Promise<boolean>;
}
