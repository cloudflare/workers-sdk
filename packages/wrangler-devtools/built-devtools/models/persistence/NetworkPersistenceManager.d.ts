import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import * as Workspace from '../workspace/workspace.js';
export declare class NetworkPersistenceManager extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements SDK.TargetManager.Observer {
    #private;
    private bindings;
    private readonly originalResponseContentPromises;
    private savingForOverrides;
    private readonly savingSymbol;
    private enabledSetting;
    private readonly workspace;
    private readonly networkUISourceCodeForEncodedPath;
    private readonly interceptionHandlerBound;
    private readonly updateInterceptionThrottler;
    private projectInternal;
    private readonly activeProject;
    private activeInternal;
    private enabled;
    private eventDescriptors;
    private constructor();
    targetAdded(): void;
    targetRemoved(): void;
    static instance(opts?: {
        forceNew: boolean | null;
        workspace: Workspace.Workspace.WorkspaceImpl | null;
    }): NetworkPersistenceManager;
    active(): boolean;
    project(): Workspace.Workspace.Project | null;
    originalContentForUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): Promise<string | null> | null;
    private enabledChanged;
    private uiSourceCodeRenamedListener;
    private uiSourceCodeRemovedListener;
    private uiSourceCodeAdded;
    private updateActiveProject;
    encodedPathFromUrl(url: Platform.DevToolsPath.UrlString, ignoreInactive?: boolean): Platform.DevToolsPath.EncodedPathString;
    rawPathFromUrl(url: Platform.DevToolsPath.UrlString, ignoreInactive?: boolean): Platform.DevToolsPath.RawPathString;
    fileUrlFromNetworkUrl(url: Platform.DevToolsPath.UrlString, ignoreInactive?: boolean): Platform.DevToolsPath.UrlString;
    private getHeadersUISourceCodeFromUrl;
    getOrCreateHeadersUISourceCodeFromUrl(url: Platform.DevToolsPath.UrlString): Promise<Workspace.UISourceCode.UISourceCode | null>;
    private decodeLocalPathToUrlPath;
    private onUISourceCodeWorkingCopyCommitted;
    canSaveUISourceCodeForOverrides(uiSourceCode: Workspace.UISourceCode.UISourceCode): boolean;
    saveUISourceCodeForOverrides(uiSourceCode: Workspace.UISourceCode.UISourceCode): Promise<void>;
    private fileCreatedForTest;
    private patternForFileSystemUISourceCode;
    private onUISourceCodeAdded;
    private canHandleNetworkUISourceCode;
    private networkUISourceCodeAdded;
    private filesystemUISourceCodeAdded;
    generateHeaderPatterns(uiSourceCode: Workspace.UISourceCode.UISourceCode): Promise<{
        headerPatterns: Set<string>;
        path: Platform.DevToolsPath.EncodedPathString;
        overridesWithRegex: HeaderOverrideWithRegex[];
    }>;
    updateInterceptionPatternsForTests(): Promise<void>;
    updateInterceptionPatterns(): void;
    private onUISourceCodeRemoved;
    private networkUISourceCodeRemoved;
    private filesystemUISourceCodeRemoved;
    setProject(project: Workspace.Workspace.Project | null): Promise<void>;
    private onProjectAdded;
    private onProjectRemoved;
    mergeHeaders(baseHeaders: Protocol.Fetch.HeaderEntry[], overrideHeaders: Protocol.Network.Headers): Protocol.Fetch.HeaderEntry[];
    handleHeaderInterception(interceptedRequest: SDK.NetworkManager.InterceptedRequest): Protocol.Fetch.HeaderEntry[];
    private interceptionHandler;
}
export declare const HEADERS_FILENAME = ".headers";
export declare enum Events {
    ProjectChanged = "ProjectChanged"
}
export declare type EventTypes = {
    [Events.ProjectChanged]: Workspace.Workspace.Project | null;
};
export interface HeaderOverride {
    applyTo: string;
    headers: Protocol.Network.Headers;
}
interface HeaderOverrideWithRegex {
    applyToRegex: RegExp;
    headers: Protocol.Network.Headers;
}
export declare function isHeaderOverride(arg: any): arg is HeaderOverride;
export declare function escapeRegex(pattern: string): string;
export declare function extractDirectoryIndex(pattern: string): {
    head: string;
    tail?: string;
};
export {};
