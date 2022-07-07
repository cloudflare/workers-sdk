import type { ActionDelegate as ActionDelegateInterface } from './ActionRegistration.js';
import type { Context } from './Context.js';
import type { ContextMenu } from './ContextMenu.js';
import type { Icon } from './Icon.js';
import type { Panel } from './Panel.js';
import { SplitWidget } from './SplitWidget.js';
import type { TabbedPane, TabbedPaneTabDelegate } from './TabbedPane.js';
import type { View, ViewLocation, ViewLocationResolver } from './View.js';
import type { Widget } from './Widget.js';
import { VBox } from './Widget.js';
export declare class InspectorView extends VBox implements ViewLocationResolver {
    #private;
    private readonly drawerSplitWidget;
    private readonly tabDelegate;
    private readonly drawerTabbedLocation;
    private drawerTabbedPane;
    private infoBarDiv;
    private readonly tabbedLocation;
    readonly tabbedPane: TabbedPane;
    private readonly keyDownBound;
    private currentPanelLocked?;
    private focusRestorer?;
    private ownerSplitWidget?;
    private reloadRequiredInfobar?;
    constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    } | undefined): InspectorView;
    static maybeGetInspectorViewInstance(): InspectorView | undefined;
    wasShown(): void;
    willHide(): void;
    resolveLocation(locationName: string): ViewLocation | null;
    createToolbars(): Promise<void>;
    addPanel(view: View): void;
    hasPanel(panelName: string): boolean;
    panel(panelName: string): Promise<Panel>;
    onSuspendStateChanged(allTargetsSuspended: boolean): void;
    canSelectPanel(panelName: string): boolean;
    showPanel(panelName: string): Promise<void>;
    setPanelIcon(tabId: string, icon: Icon | null): void;
    private emitDrawerChangeEvent;
    private getTabbedPaneForTabId;
    currentPanelDeprecated(): Widget | null;
    showDrawer(focus: boolean): void;
    drawerVisible(): boolean;
    closeDrawer(): void;
    setDrawerMinimized(minimized: boolean): void;
    isDrawerMinimized(): boolean;
    closeDrawerTab(id: string, userGesture?: boolean): void;
    private keyDown;
    onResize(): void;
    topResizerElement(): Element;
    toolbarItemResized(): void;
    private tabSelected;
    setOwnerSplit(splitWidget: SplitWidget): void;
    ownerSplit(): SplitWidget | null;
    minimize(): void;
    restore(): void;
    displayReloadRequiredWarning(message: string): void;
    displaySelectOverrideFolderInfobar(callback: () => void): void;
    private createInfoBarDiv;
    private attachInfobar;
}
export declare class ActionDelegate implements ActionDelegateInterface {
    static instance(opts?: {
        forceNew: boolean | null;
    }): ActionDelegate;
    handleAction(context: Context, actionId: string): boolean;
}
export declare class InspectorViewTabDelegate implements TabbedPaneTabDelegate {
    closeTabs(tabbedPane: TabbedPane, ids: string[]): void;
    moveToDrawer(tabId: string): void;
    moveToMainPanel(tabId: string): void;
    onContextMenu(tabId: string, contextMenu: ContextMenu): void;
}
export declare enum Events {
    DrawerChange = "drawerchange"
}
