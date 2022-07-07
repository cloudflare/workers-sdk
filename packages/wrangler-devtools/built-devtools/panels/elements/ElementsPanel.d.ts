import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import type * as Adorners from '../../ui/components/adorners/adorners.js';
import * as UI from '../../ui/legacy/legacy.js';
import { ComputedStyleWidget } from './ComputedStyleWidget.js';
import type { MarkerDecorator } from './MarkerDecorator.js';
import { StylesSidebarPane } from './StylesSidebarPane.js';
/**
 * These strings need to match the `SidebarPaneCodes` in UserMetrics.ts. DevTools
 * collects usage metrics for the different sidebar tabs.
 */
export declare const enum SidebarPaneTabId {
    Computed = "Computed",
    Styles = "Styles"
}
export declare class ElementsPanel extends UI.Panel.Panel implements UI.SearchableView.Searchable, SDK.TargetManager.SDKModelObserver<SDK.DOMModel.DOMModel>, UI.View.ViewLocationResolver {
    private splitWidget;
    private readonly searchableViewInternal;
    private mainContainer;
    private domTreeContainer;
    private splitMode;
    private readonly accessibilityTreeView;
    private breadcrumbs;
    stylesWidget: StylesSidebarPane;
    private readonly computedStyleWidget;
    private readonly metricsWidget;
    private treeOutlines;
    private readonly treeOutlineHeaders;
    private searchResults;
    private currentSearchResultIndex;
    pendingNodeReveal: boolean;
    private readonly adornerManager;
    private adornerSettingsPane;
    private readonly adornersByName;
    accessibilityTreeButton?: HTMLElement;
    domTreeButton?: HTMLElement;
    private selectedNodeOnReset?;
    private hasNonDefaultSelectedNode?;
    private searchConfig?;
    private omitDefaultSelection?;
    private notFirstInspectElement?;
    sidebarPaneView?: UI.View.TabbedViewLocation;
    private stylesViewToReveal?;
    private cssStyleTrackerByCSSModel;
    constructor();
    private initializeFullAccessibilityTreeView;
    private showAccessibilityTree;
    private showDOMTree;
    static instance(opts?: {
        forceNew: boolean | null;
    } | undefined): ElementsPanel;
    revealProperty(cssProperty: SDK.CSSProperty.CSSProperty): Promise<void>;
    resolveLocation(_locationName: string): UI.View.ViewLocation | null;
    showToolbarPane(widget: UI.Widget.Widget | null, toggle: UI.Toolbar.ToolbarToggle | null): void;
    modelAdded(domModel: SDK.DOMModel.DOMModel): void;
    modelRemoved(domModel: SDK.DOMModel.DOMModel): void;
    private targetNameChanged;
    private updateTreeOutlineVisibleWidth;
    focus(): void;
    searchableView(): UI.SearchableView.SearchableView;
    wasShown(): void;
    willHide(): void;
    onResize(): void;
    private selectedNodeChanged;
    private documentUpdatedEvent;
    private documentUpdated;
    private lastSelectedNodeSelectedForTest;
    private setDefaultSelectedNode;
    searchCanceled(): void;
    performSearch(searchConfig: UI.SearchableView.SearchConfig, shouldJump: boolean, jumpBackwards?: boolean): void;
    private domWordWrapSettingChanged;
    switchToAndFocus(node: SDK.DOMModel.DOMNode): void;
    private jumpToSearchResult;
    jumpToNextSearchResult(): void;
    jumpToPreviousSearchResult(): void;
    supportsCaseSensitiveSearch(): boolean;
    supportsRegexSearch(): boolean;
    private highlightCurrentSearchResult;
    private hideSearchHighlights;
    selectedDOMNode(): SDK.DOMModel.DOMNode | null;
    selectDOMNode(node: SDK.DOMModel.DOMNode, focus?: boolean): void;
    private updateBreadcrumbIfNeeded;
    private crumbNodeSelected;
    private treeOutlineForNode;
    private treeElementForNode;
    private leaveUserAgentShadowDOM;
    revealAndSelectNode(nodeToReveal: SDK.DOMModel.DOMNode, focus: boolean, omitHighlight?: boolean): Promise<void>;
    private showUAShadowDOMChanged;
    private setupTextSelectionHack;
    private initializeSidebarPanes;
    private updateSidebarPosition;
    private extensionSidebarPaneAdded;
    private addExtensionSidebarPane;
    getComputedStyleWidget(): ComputedStyleWidget;
    private setupStyleTracking;
    private removeStyleTracking;
    private trackedCSSPropertiesUpdated;
    showAdornerSettingsPane(): void;
    isAdornerEnabled(adornerText: string): boolean;
    registerAdorner(adorner: Adorners.Adorner.Adorner): void;
    deregisterAdorner(adorner: Adorners.Adorner.Adorner): void;
    private static firstInspectElementCompletedForTest;
    private static firstInspectElementNodeNameForTest;
}
export declare const enum _splitMode {
    Vertical = "Vertical",
    Horizontal = "Horizontal"
}
export declare class ContextMenuProvider implements UI.ContextMenu.Provider {
    appendApplicableItems(event: Event, contextMenu: UI.ContextMenu.ContextMenu, object: Object): void;
    static instance(): ContextMenuProvider;
}
export declare class DOMNodeRevealer implements Common.Revealer.Revealer {
    static instance(opts?: {
        forceNew: boolean | null;
    }): DOMNodeRevealer;
    reveal(node: Object, omitFocus?: boolean): Promise<void>;
}
export declare class CSSPropertyRevealer implements Common.Revealer.Revealer {
    static instance(opts?: {
        forceNew: boolean | null;
    }): CSSPropertyRevealer;
    reveal(property: Object): Promise<void>;
}
export declare class ElementsActionDelegate implements UI.ActionRegistration.ActionDelegate {
    handleAction(context: UI.Context.Context, actionId: string): boolean;
    static instance(opts?: {
        forceNew: boolean | null;
    } | undefined): ElementsActionDelegate;
}
export declare class PseudoStateMarkerDecorator implements MarkerDecorator {
    static instance(opts?: {
        forceNew: boolean | null;
    }): PseudoStateMarkerDecorator;
    decorate(node: SDK.DOMModel.DOMNode): {
        title: string;
        color: string;
    } | null;
}
