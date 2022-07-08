import * as Common from '../common/common.js';
import * as Platform from '../platform/platform.js';
import type { CanShowSurveyResult, ContextMenuDescriptor, EnumeratedHistogram, EventTypes, ExtensionDescriptor, InspectorFrontendHostAPI, LoadNetworkResourceResult, ShowSurveyResult, SyncInformation } from './InspectorFrontendHostAPI.js';
export declare class InspectorFrontendHostStub implements InspectorFrontendHostAPI {
    #private;
    events: Common.EventTarget.EventTarget<EventTypes>;
    recordedEnumeratedHistograms: {
        actionName: EnumeratedHistogram;
        actionCode: number;
    }[];
    recordedPerformanceHistograms: {
        histogramName: string;
        duration: number;
    }[];
    constructor();
    platform(): string;
    loadCompleted(): void;
    bringToFront(): void;
    closeWindow(): void;
    setIsDocked(isDocked: boolean, callback: () => void): void;
    showSurvey(trigger: string, callback: (arg0: ShowSurveyResult) => void): void;
    canShowSurvey(trigger: string, callback: (arg0: CanShowSurveyResult) => void): void;
    /**
     * Requests inspected page to be placed atop of the inspector frontend with specified bounds.
     */
    setInspectedPageBounds(bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
    }): void;
    inspectElementCompleted(): void;
    setInjectedScriptForOrigin(origin: string, script: string): void;
    inspectedURLChanged(url: Platform.DevToolsPath.UrlString): void;
    copyText(text: string | null | undefined): void;
    openInNewTab(url: Platform.DevToolsPath.UrlString): void;
    showItemInFolder(fileSystemPath: Platform.DevToolsPath.RawPathString): void;
    save(url: Platform.DevToolsPath.RawPathString | Platform.DevToolsPath.UrlString, content: string, forceSaveAs: boolean): void;
    append(url: Platform.DevToolsPath.RawPathString | Platform.DevToolsPath.UrlString, content: string): void;
    close(url: Platform.DevToolsPath.RawPathString | Platform.DevToolsPath.UrlString): void;
    sendMessageToBackend(message: string): void;
    recordEnumeratedHistogram(actionName: EnumeratedHistogram, actionCode: number, bucketSize: number): void;
    recordPerformanceHistogram(histogramName: string, duration: number): void;
    recordUserMetricsAction(umaName: string): void;
    requestFileSystems(): void;
    addFileSystem(type?: string): void;
    removeFileSystem(fileSystemPath: Platform.DevToolsPath.RawPathString): void;
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
    indexPath(requestId: number, fileSystemPath: Platform.DevToolsPath.RawPathString, excludedFolders: string): void;
    stopIndexing(requestId: number): void;
    searchInPath(requestId: number, fileSystemPath: Platform.DevToolsPath.RawPathString, query: string): void;
    zoomFactor(): number;
    zoomIn(): void;
    zoomOut(): void;
    resetZoom(): void;
    setWhitelistedShortcuts(shortcuts: string): void;
    setEyeDropperActive(active: boolean): void;
    showCertificateViewer(certChain: string[]): void;
    reattach(callback: () => void): void;
    readyForTest(): void;
    connectionReady(): void;
    setOpenNewWindowForPopups(value: boolean): void;
    setDevicesDiscoveryConfig(config: Adb.Config): void;
    setDevicesUpdatesEnabled(enabled: boolean): void;
    performActionOnRemotePage(pageId: string, action: string): void;
    openRemotePage(browserId: string, url: string): void;
    openNodeFrontend(): void;
    showContextMenuAtPoint(x: number, y: number, items: ContextMenuDescriptor[], document: Document): void;
    isHostedMode(): boolean;
    setAddExtensionCallback(callback: (arg0: ExtensionDescriptor) => void): void;
    initialTargetId(): Promise<string | null>;
}
export declare let InspectorFrontendHostInstance: InspectorFrontendHostStub;
export declare function isUnderTest(prefs?: {
    [x: string]: string;
}): boolean;
