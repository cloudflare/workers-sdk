import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import type * as TextUtils from '../text_utils/text_utils.js';
import { ExtensionSidebarPane } from './ExtensionPanel.js';
import type { TracingSession } from './ExtensionTraceProvider.js';
import { ExtensionTraceProvider } from './ExtensionTraceProvider.js';
import { PrivateAPI } from './ExtensionAPI.js';
declare global {
    interface Window {
        DevToolsAPI?: {
            getInspectedTabId?(): string | undefined;
            getOriginsForbiddenForExtensions?(): string[];
        };
    }
}
export declare class ExtensionServer extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    private readonly clientObjects;
    private readonly handlers;
    private readonly subscribers;
    private readonly subscriptionStartHandlers;
    private readonly subscriptionStopHandlers;
    private readonly extraHeaders;
    private requests;
    private readonly requestIds;
    private lastRequestId;
    private registeredExtensions;
    private status;
    private readonly sidebarPanesInternal;
    private readonly traceProvidersInternal;
    private readonly traceSessions;
    private extensionsEnabled;
    private inspectedTabId?;
    private readonly extensionAPITestHook?;
    private themeChangeHandlers;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): ExtensionServer;
    initializeExtensions(): void;
    hasExtensions(): boolean;
    notifySearchAction(panelId: string, action: string, searchString?: string): void;
    notifyViewShown(identifier: string, frameIndex?: number): void;
    notifyViewHidden(identifier: string): void;
    notifyButtonClicked(identifier: string): void;
    private registerLanguageExtensionEndpoint;
    private loadWasmValue;
    private onGetWasmLinearMemory;
    private onGetWasmGlobal;
    private onGetWasmLocal;
    private onGetWasmOp;
    private registerRecorderExtensionEndpoint;
    private inspectedURLChanged;
    startTraceRecording(providerId: string, sessionId: string, session: TracingSession): void;
    stopTraceRecording(providerId: string): void;
    hasSubscribers(type: string): boolean;
    private postNotification;
    private onSubscribe;
    private onUnsubscribe;
    private onAddRequestHeaders;
    private onApplyStyleSheet;
    private getExtensionOrigin;
    private onCreatePanel;
    private onShowPanel;
    private onCreateToolbarButton;
    private onUpdateButton;
    private onCompleteTraceSession;
    private onCreateSidebarPane;
    sidebarPanes(): ExtensionSidebarPane[];
    private onSetSidebarHeight;
    private onSetSidebarContent;
    private onSetSidebarPage;
    private onOpenResource;
    private onSetOpenResourceHandler;
    private onSetThemeChangeHandler;
    private handleOpenURL;
    private onReload;
    private onEvaluateOnInspectedPage;
    private onGetHAR;
    private makeResource;
    private onGetPageResources;
    private getResourceContent;
    private onGetRequestContent;
    private onGetResourceContent;
    private onSetResourceContent;
    private requestId;
    private requestById;
    private onAddTraceProvider;
    traceProviders(): ExtensionTraceProvider[];
    private onForwardKeyboardEvent;
    private dispatchCallback;
    private initExtensions;
    private notifyResourceAdded;
    private notifyUISourceCodeContentCommitted;
    private notifyRequestFinished;
    private notifyElementsSelectionChanged;
    sourceSelectionChanged(url: Platform.DevToolsPath.UrlString, range: TextUtils.TextRange.TextRange): void;
    private setInspectedTabId;
    addExtensionForTest(extensionInfo: Host.InspectorFrontendHostAPI.ExtensionDescriptor, origin: string): boolean | undefined;
    private addExtension;
    private registerExtension;
    private onWindowMessage;
    private onmessage;
    private registerHandler;
    private registerSubscriptionHandler;
    private registerAutosubscriptionHandler;
    private registerAutosubscriptionTargetManagerHandler;
    private registerResourceContentCommittedHandler;
    private expandResourcePath;
    evaluate(expression: string, exposeCommandLineAPI: boolean, returnByValue: boolean, options: PrivateAPI.EvaluateOptions | undefined, securityOrigin: string, callback: (arg0: string | null, arg1: SDK.RemoteObject.RemoteObject | null, arg2: boolean) => unknown): Record | undefined;
    private canInspectURL;
    private disableExtensions;
}
export declare enum Events {
    SidebarPaneAdded = "SidebarPaneAdded",
    TraceProviderAdded = "TraceProviderAdded"
}
export declare type EventTypes = {
    [Events.SidebarPaneAdded]: ExtensionSidebarPane;
    [Events.TraceProviderAdded]: ExtensionTraceProvider;
};
export declare class ExtensionStatus {
    OK: (...args: unknown[]) => Record;
    E_EXISTS: (...args: unknown[]) => Record;
    E_BADARG: (...args: unknown[]) => Record;
    E_BADARGTYPE: (...args: unknown[]) => Record;
    E_NOTFOUND: (...args: unknown[]) => Record;
    E_NOTSUPPORTED: (...args: unknown[]) => Record;
    E_PROTOCOLERROR: (...args: unknown[]) => Record;
    E_FAILED: (...args: unknown[]) => Record;
    constructor();
}
export interface Record {
    code: string;
    description: string;
    details: unknown[];
    isError?: boolean;
}
