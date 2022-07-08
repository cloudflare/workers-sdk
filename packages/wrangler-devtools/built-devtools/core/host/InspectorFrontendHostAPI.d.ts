import type * as Platform from '../../core/platform/platform.js';
export declare enum Events {
    AppendedToURL = "appendedToURL",
    CanceledSaveURL = "canceledSaveURL",
    ContextMenuCleared = "contextMenuCleared",
    ContextMenuItemSelected = "contextMenuItemSelected",
    DeviceCountUpdated = "deviceCountUpdated",
    DevicesDiscoveryConfigChanged = "devicesDiscoveryConfigChanged",
    DevicesPortForwardingStatusChanged = "devicesPortForwardingStatusChanged",
    DevicesUpdated = "devicesUpdated",
    DispatchMessage = "dispatchMessage",
    DispatchMessageChunk = "dispatchMessageChunk",
    EnterInspectElementMode = "enterInspectElementMode",
    EyeDropperPickedColor = "eyeDropperPickedColor",
    FileSystemsLoaded = "fileSystemsLoaded",
    FileSystemRemoved = "fileSystemRemoved",
    FileSystemAdded = "fileSystemAdded",
    FileSystemFilesChangedAddedRemoved = "FileSystemFilesChangedAddedRemoved",
    IndexingTotalWorkCalculated = "indexingTotalWorkCalculated",
    IndexingWorked = "indexingWorked",
    IndexingDone = "indexingDone",
    KeyEventUnhandled = "keyEventUnhandled",
    ReattachMainTarget = "reattachMainTarget",
    ReloadInspectedPage = "reloadInspectedPage",
    RevealSourceLine = "revealSourceLine",
    SavedURL = "savedURL",
    SearchCompleted = "searchCompleted",
    SetInspectedTabId = "setInspectedTabId",
    SetUseSoftMenu = "setUseSoftMenu",
    ShowPanel = "showPanel"
}
export declare const EventDescriptors: (string | string[])[][];
export interface DispatchMessageChunkEvent {
    messageChunk: string;
    messageSize: number;
}
export interface EyeDropperPickedColorEvent {
    r: number;
    g: number;
    b: number;
    a: number;
}
export interface DevToolsFileSystem {
    type: string;
    fileSystemName: string;
    rootURL: string;
    fileSystemPath: Platform.DevToolsPath.RawPathString;
}
export interface FileSystemAddedEvent {
    errorMessage?: string;
    fileSystem: DevToolsFileSystem | null;
}
export interface FilesChangedEvent {
    changed: Platform.DevToolsPath.RawPathString[];
    added: Platform.DevToolsPath.RawPathString[];
    removed: Platform.DevToolsPath.RawPathString[];
}
export interface IndexingEvent {
    requestId: number;
    fileSystemPath: string;
}
export interface IndexingTotalWorkCalculatedEvent extends IndexingEvent {
    totalWork: number;
}
export interface IndexingWorkedEvent extends IndexingEvent {
    worked: number;
}
export interface KeyEventUnhandledEvent {
    type: string;
    key: string;
    keyCode: number;
    modifiers: number;
}
export interface RevealSourceLineEvent {
    url: Platform.DevToolsPath.UrlString;
    lineNumber: number;
    columnNumber: number;
}
export interface SavedURLEvent {
    url: Platform.DevToolsPath.RawPathString | Platform.DevToolsPath.UrlString;
    fileSystemPath: Platform.DevToolsPath.RawPathString | Platform.DevToolsPath.UrlString;
}
export interface SearchCompletedEvent {
    requestId: number;
    files: Platform.DevToolsPath.RawPathString[];
}
export declare type EventTypes = {
    [Events.AppendedToURL]: Platform.DevToolsPath.RawPathString | Platform.DevToolsPath.UrlString;
    [Events.CanceledSaveURL]: Platform.DevToolsPath.UrlString;
    [Events.ContextMenuCleared]: void;
    [Events.ContextMenuItemSelected]: number;
    [Events.DeviceCountUpdated]: number;
    [Events.DevicesDiscoveryConfigChanged]: Adb.Config;
    [Events.DevicesPortForwardingStatusChanged]: void;
    [Events.DevicesUpdated]: void;
    [Events.DispatchMessage]: string;
    [Events.DispatchMessageChunk]: DispatchMessageChunkEvent;
    [Events.EnterInspectElementMode]: void;
    [Events.EyeDropperPickedColor]: EyeDropperPickedColorEvent;
    [Events.FileSystemsLoaded]: DevToolsFileSystem[];
    [Events.FileSystemRemoved]: Platform.DevToolsPath.RawPathString;
    [Events.FileSystemAdded]: FileSystemAddedEvent;
    [Events.FileSystemFilesChangedAddedRemoved]: FilesChangedEvent;
    [Events.IndexingTotalWorkCalculated]: IndexingTotalWorkCalculatedEvent;
    [Events.IndexingWorked]: IndexingWorkedEvent;
    [Events.IndexingDone]: IndexingEvent;
    [Events.KeyEventUnhandled]: KeyEventUnhandledEvent;
    [Events.ReattachMainTarget]: void;
    [Events.ReloadInspectedPage]: boolean;
    [Events.RevealSourceLine]: RevealSourceLineEvent;
    [Events.SavedURL]: SavedURLEvent;
    [Events.SearchCompleted]: SearchCompletedEvent;
    [Events.SetInspectedTabId]: string;
    [Events.SetUseSoftMenu]: boolean;
    [Events.ShowPanel]: string;
};
export interface InspectorFrontendHostAPI {
    addFileSystem(type?: string): void;
    loadCompleted(): void;
    indexPath(requestId: number, fileSystemPath: Platform.DevToolsPath.RawPathString, excludedFolders: string): void;
    /**
     * Requests inspected page to be placed atop of the inspector frontend with specified bounds.
     */
    setInspectedPageBounds(bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
    }): void;
    showCertificateViewer(certChain: string[]): void;
    setWhitelistedShortcuts(shortcuts: string): void;
    setEyeDropperActive(active: boolean): void;
    inspectElementCompleted(): void;
    openInNewTab(url: Platform.DevToolsPath.UrlString): void;
    showItemInFolder(fileSystemPath: Platform.DevToolsPath.RawPathString): void;
    removeFileSystem(fileSystemPath: Platform.DevToolsPath.RawPathString): void;
    requestFileSystems(): void;
    save(url: Platform.DevToolsPath.UrlString, content: string, forceSaveAs: boolean): void;
    append(url: Platform.DevToolsPath.UrlString, content: string): void;
    close(url: Platform.DevToolsPath.UrlString): void;
    searchInPath(requestId: number, fileSystemPath: Platform.DevToolsPath.RawPathString, query: string): void;
    stopIndexing(requestId: number): void;
    bringToFront(): void;
    closeWindow(): void;
    copyText(text: string | null | undefined): void;
    inspectedURLChanged(url: Platform.DevToolsPath.UrlString): void;
    isolatedFileSystem(fileSystemId: string, registeredName: string): FileSystem | null;
    loadNetworkResource(url: string, headers: string, streamId: number, callback: (arg0: LoadNetworkResourceResult) => void): void;
    registerPreference(name: string, options: {
        synced?: boolean;
    }): void;
    getPreferences(callback: (arg0: {
        [x: string]: string;
    }) => void): void;
    getPreference(name: string, callback: (arg0: string) => void): void;
    setPreference(name: string, value: string): void;
    removePreference(name: string): void;
    clearPreferences(): void;
    getSyncInformation(callback: (arg0: SyncInformation) => void): void;
    upgradeDraggedFileSystemPermissions(fileSystem: FileSystem): void;
    platform(): string;
    recordEnumeratedHistogram(actionName: EnumeratedHistogram, actionCode: number, bucketSize: number): void;
    recordPerformanceHistogram(histogramName: string, duration: number): void;
    recordUserMetricsAction(umaName: string): void;
    sendMessageToBackend(message: string): void;
    setDevicesDiscoveryConfig(config: Adb.Config): void;
    setDevicesUpdatesEnabled(enabled: boolean): void;
    performActionOnRemotePage(pageId: string, action: string): void;
    openRemotePage(browserId: string, url: string): void;
    openNodeFrontend(): void;
    setInjectedScriptForOrigin(origin: string, script: string): void;
    setIsDocked(isDocked: boolean, callback: () => void): void;
    showSurvey(trigger: string, callback: (arg0: ShowSurveyResult) => void): void;
    canShowSurvey(trigger: string, callback: (arg0: CanShowSurveyResult) => void): void;
    zoomFactor(): number;
    zoomIn(): void;
    zoomOut(): void;
    resetZoom(): void;
    showContextMenuAtPoint(x: number, y: number, items: ContextMenuDescriptor[], document: Document): void;
    reattach(callback: () => void): void;
    readyForTest(): void;
    connectionReady(): void;
    setOpenNewWindowForPopups(value: boolean): void;
    isHostedMode(): boolean;
    setAddExtensionCallback(callback: (arg0: ExtensionDescriptor) => void): void;
    initialTargetId(): Promise<string | null>;
}
export interface ContextMenuDescriptor {
    type: string;
    id?: number;
    label?: string;
    enabled?: boolean;
    checked?: boolean;
    subItems?: ContextMenuDescriptor[];
}
export interface LoadNetworkResourceResult {
    statusCode: number;
    headers?: {
        [x: string]: string;
    };
    netError?: number;
    netErrorName?: string;
    urlValid?: boolean;
    messageOverride?: string;
}
export interface ExtensionDescriptor {
    startPage: string;
    name: string;
    exposeExperimentalAPIs: boolean;
}
export interface ShowSurveyResult {
    surveyShown: boolean;
}
export interface CanShowSurveyResult {
    canShowSurvey: boolean;
}
export interface SyncInformation {
    /** Whether Chrome Sync is enabled and active */
    isSyncActive: boolean;
    /** Whether syncing of Chrome Settings is enabled via Chrome Sync is enabled */
    arePreferencesSynced?: boolean;
    /** The email of the account used for syncing */
    accountEmail?: string;
    /** The image of the account used for syncing. Its a base64 encoded PNG */
    accountImage?: string;
}
/**
 * Enum for recordPerformanceHistogram
 * Warning: There is another definition of this enum in the DevTools code
 * base, keep them in sync:
 * front_end/devtools_compatibility.js
 * @readonly
 */
export declare enum EnumeratedHistogram {
    ActionTaken = "DevTools.ActionTaken",
    PanelClosed = "DevTools.PanelClosed",
    PanelShown = "DevTools.PanelShown",
    SidebarPaneShown = "DevTools.SidebarPaneShown",
    KeyboardShortcutFired = "DevTools.KeyboardShortcutFired",
    IssueCreated = "DevTools.IssueCreated",
    IssuesPanelIssueExpanded = "DevTools.IssuesPanelIssueExpanded",
    IssuesPanelOpenedFrom = "DevTools.IssuesPanelOpenedFrom",
    IssuesPanelResourceOpened = "DevTools.IssuesPanelResourceOpened",
    KeybindSetSettingChanged = "DevTools.KeybindSetSettingChanged",
    ExperimentEnabledAtLaunch = "DevTools.ExperimentEnabledAtLaunch",
    ExperimentEnabled = "DevTools.ExperimentEnabled",
    ExperimentDisabled = "DevTools.ExperimentDisabled",
    DeveloperResourceLoaded = "DevTools.DeveloperResourceLoaded",
    DeveloperResourceScheme = "DevTools.DeveloperResourceScheme",
    LinearMemoryInspectorRevealedFrom = "DevTools.LinearMemoryInspector.RevealedFrom",
    LinearMemoryInspectorTarget = "DevTools.LinearMemoryInspector.Target",
    Language = "DevTools.Language",
    ConsoleShowsCorsErrors = "DevTools.ConsoleShowsCorsErrors",
    SyncSetting = "DevTools.SyncSetting",
    RecordingEdited = "DevTools.RecordingEdited",
    RecordingExported = "DevTools.RecordingExported",
    RecordingReplayFinished = "DevTools.RecordingReplayFinished",
    RecordingReplaySpeed = "DevTools.RecordingReplaySpeed",
    RecordingReplayStarted = "DevTools.RecordingReplayStarted",
    RecordingToggled = "DevTools.RecordingToggled",
    StyleTextCopied = "DevTools.StyleTextCopied"
}
