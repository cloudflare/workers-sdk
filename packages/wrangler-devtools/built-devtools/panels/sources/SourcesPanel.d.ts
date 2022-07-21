import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Workspace from '../../models/workspace/workspace.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { NavigatorView } from './NavigatorView.js';
import { SourcesView } from './SourcesView.js';
export declare class SourcesPanel extends UI.Panel.Panel implements UI.ContextMenu.Provider, SDK.TargetManager.Observer, UI.View.ViewLocationResolver {
    private readonly workspace;
    private readonly togglePauseAction;
    private readonly stepOverAction;
    private readonly stepIntoAction;
    private readonly stepOutAction;
    private readonly stepAction;
    private readonly toggleBreakpointsActiveAction;
    private readonly debugToolbar;
    private readonly debugToolbarDrawer;
    private readonly debuggerPausedMessage;
    private splitWidget;
    editorView: UI.SplitWidget.SplitWidget;
    private navigatorTabbedLocation;
    sourcesViewInternal: SourcesView;
    private readonly toggleNavigatorSidebarButton;
    private readonly toggleDebuggerSidebarButton;
    private threadsSidebarPane;
    private readonly watchSidebarPane;
    private readonly callstackPane;
    private liveLocationPool;
    private lastModificationTime;
    private pausedInternal?;
    private switchToPausedTargetTimeout?;
    private ignoreExecutionLineEvents?;
    private executionLineLocation?;
    private pauseOnExceptionButton?;
    private sidebarPaneStack?;
    private tabbedLocationHeader?;
    private extensionSidebarPanesContainer?;
    sidebarPaneView?: UI.Widget.VBox | UI.SplitWidget.SplitWidget;
    constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    } | undefined): SourcesPanel;
    static updateResizerAndSidebarButtons(panel: SourcesPanel): void;
    targetAdded(_target: SDK.Target.Target): void;
    targetRemoved(_target: SDK.Target.Target): void;
    private showThreadsIfNeeded;
    private setTarget;
    private onCurrentTargetChanged;
    paused(): boolean;
    wasShown(): void;
    willHide(): void;
    resolveLocation(locationName: string): UI.View.ViewLocation | null;
    ensureSourcesViewVisible(): boolean;
    onResize(): void;
    searchableView(): UI.SearchableView.SearchableView;
    toggleNavigatorSidebar(): void;
    toggleDebuggerSidebar(): void;
    private debuggerPaused;
    private showDebuggerPausedDetails;
    private debuggerResumed;
    private debuggerWasEnabled;
    get visibleView(): UI.Widget.Widget | null;
    showUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode, lineNumber?: number, columnNumber?: number, omitFocus?: boolean): void;
    private showEditor;
    showUILocation(uiLocation: Workspace.UISourceCode.UILocation, omitFocus?: boolean): void;
    revealInNavigator(uiSourceCode: Workspace.UISourceCode.UISourceCode, skipReveal?: boolean): void;
    private toggleAuthoredDeployedExperiment;
    private populateNavigatorMenu;
    setIgnoreExecutionLineEvents(ignoreExecutionLineEvents: boolean): void;
    updateLastModificationTime(): void;
    private executionLineChanged;
    private lastModificationTimeoutPassedForTest;
    private updateLastModificationTimeForTest;
    private callFrameChanged;
    private pauseOnExceptionEnabledChanged;
    private updateDebuggerButtonsAndStatus;
    private updateDebuggerButtonsAndStatusForTest;
    private clearInterface;
    private switchToPausedTarget;
    private togglePauseOnExceptions;
    runSnippet(): void;
    private editorSelected;
    togglePause(): boolean;
    private prepareToResume;
    private longResume;
    private terminateExecution;
    stepOver(): boolean;
    stepInto(): boolean;
    stepIntoAsync(): boolean;
    stepOut(): boolean;
    private continueToLocation;
    toggleBreakpointsActive(): void;
    private breakpointsActiveStateChanged;
    private createDebugToolbar;
    private createDebugToolbarDrawer;
    appendApplicableItems(event: Event, contextMenu: UI.ContextMenu.ContextMenu, target: Object): void;
    private appendUISourceCodeItems;
    private appendUISourceCodeFrameItems;
    appendUILocationItems(contextMenu: UI.ContextMenu.ContextMenu, object: Object): void;
    private handleContextMenuReveal;
    private appendRemoteObjectItems;
    private appendNetworkRequestItems;
    private showFunctionDefinition;
    private didGetFunctionDetails;
    private revealNavigatorSidebar;
    private revealDebuggerSidebar;
    private updateSidebarPosition;
    setAsCurrentPanel(): Promise<void>;
    private extensionSidebarPaneAdded;
    private addExtensionSidebarPane;
    sourcesView(): SourcesView;
    private handleDrop;
}
export declare let lastModificationTimeout: number;
export declare const minToolbarWidth = 215;
export declare class UILocationRevealer implements Common.Revealer.Revealer {
    static instance(opts?: {
        forceNew: boolean | null;
    }): UILocationRevealer;
    reveal(uiLocation: Object, omitFocus?: boolean): Promise<void>;
}
export declare class DebuggerLocationRevealer implements Common.Revealer.Revealer {
    static instance(opts?: {
        forceNew: boolean | null;
    }): DebuggerLocationRevealer;
    reveal(rawLocation: Object, omitFocus?: boolean): Promise<void>;
}
export declare class UISourceCodeRevealer implements Common.Revealer.Revealer {
    static instance(opts?: {
        forceNew: boolean | null;
    }): UISourceCodeRevealer;
    reveal(uiSourceCode: Object, omitFocus?: boolean): Promise<void>;
}
export declare class DebuggerPausedDetailsRevealer implements Common.Revealer.Revealer {
    static instance(opts?: {
        forceNew: boolean | null;
    }): DebuggerPausedDetailsRevealer;
    reveal(_object: Object): Promise<void>;
}
export declare class RevealingActionDelegate implements UI.ActionRegistration.ActionDelegate {
    static instance(opts?: {
        forceNew: boolean | null;
    }): RevealingActionDelegate;
    handleAction(context: UI.Context.Context, actionId: string): boolean;
}
export declare class ActionDelegate implements UI.ActionRegistration.ActionDelegate {
    static instance(opts?: {
        forceNew: boolean | null;
    }): ActionDelegate;
    handleAction(context: UI.Context.Context, actionId: string): boolean;
}
export declare class WrapperView extends UI.Widget.VBox {
    private readonly view;
    constructor();
    static instance(): WrapperView;
    static isShowing(): boolean;
    wasShown(): void;
    willHide(): void;
    showViewInWrapper(): void;
}
export interface NavigatorViewRegistration {
    navigatorView: () => NavigatorView;
    viewId: string;
    experiment?: string;
}
