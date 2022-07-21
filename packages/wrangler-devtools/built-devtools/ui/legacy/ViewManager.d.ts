import * as Common from '../../core/common/common.js';
import { TabbedPane } from './TabbedPane.js';
import type { ToolbarItem } from './Toolbar.js';
import { ToolbarMenuButton } from './Toolbar.js';
import type { TabbedViewLocation, View, ViewLocation } from './View.js';
import { getRegisteredLocationResolvers, getRegisteredViewExtensions, maybeRemoveViewExtension, registerLocationResolver, registerViewExtension, ViewLocationCategoryValues, ViewLocationValues, ViewPersistence, type ViewRegistration, resetViewRegistration } from './ViewRegistration.js';
import type { Widget } from './Widget.js';
import { VBox } from './Widget.js';
export declare const defaultOptionsForTabs: {
    security: boolean;
};
export declare class PreRegisteredView implements View {
    private readonly viewRegistration;
    private widgetRequested;
    constructor(viewRegistration: ViewRegistration);
    title(): Common.UIString.LocalizedString;
    commandPrompt(): Common.UIString.LocalizedString;
    isCloseable(): boolean;
    isPreviewFeature(): boolean;
    isTransient(): boolean;
    viewId(): string;
    location(): ViewLocationValues | undefined;
    order(): number | undefined;
    settings(): string[] | undefined;
    tags(): string | undefined;
    persistence(): ViewPersistence | undefined;
    toolbarItems(): Promise<any>;
    widget(): Promise<Widget>;
    disposeView(): Promise<void>;
    experiment(): string | undefined;
    condition(): string | undefined;
}
export declare class ViewManager {
    readonly views: Map<string, View>;
    private readonly locationNameByViewId;
    private readonly locationOverrideSetting;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): ViewManager;
    static removeInstance(): void;
    static createToolbar(toolbarItems: ToolbarItem[]): Element | null;
    locationNameForViewId(viewId: string): string;
    /**
     * Moves a view to a new location
     */
    moveView(viewId: string, locationName: string, options?: {
        shouldSelectTab: (boolean);
        overrideSaving: (boolean);
    }): void;
    revealView(view: View): Promise<void>;
    /**
     * Show view in location
     */
    showViewInLocation(viewId: string, locationName: string, shouldSelectTab?: boolean | undefined): void;
    view(viewId: string): View;
    materializedWidget(viewId: string): Widget | null;
    showView(viewId: string, userGesture?: boolean, omitFocus?: boolean): Promise<void>;
    resolveLocation(location?: string): Promise<Location | null>;
    createTabbedLocation(revealCallback?: (() => void), location?: string, restoreSelection?: boolean, allowReorder?: boolean, defaultTab?: string | null): TabbedViewLocation;
    createStackLocation(revealCallback?: (() => void), location?: string): ViewLocation;
    hasViewsForLocation(location: string): boolean;
    viewsForLocation(location: string): View[];
}
export declare class ContainerWidget extends VBox {
    private readonly view;
    private materializePromise?;
    constructor(view: View);
    materialize(): Promise<any>;
    wasShown(): void;
    private wasShownForTest;
}
export declare class _ExpandableContainerWidget extends VBox {
    private titleElement;
    private readonly titleExpandIcon;
    private readonly view;
    private widget?;
    private materializePromise?;
    constructor(view: View);
    wasShown(): void;
    private materialize;
    expand(): Promise<any>;
    private collapse;
    private toggleExpanded;
    private onTitleKeyDown;
}
declare class Location {
    protected readonly manager: ViewManager;
    private readonly revealCallback;
    private readonly widgetInternal;
    constructor(manager: ViewManager, widget: Widget, revealCallback?: (() => void));
    widget(): Widget;
    reveal(): void;
    showView(_view: View, _insertBefore?: View | null, _userGesture?: boolean, _omitFocus?: boolean, _shouldSelectTab?: boolean): Promise<void>;
    removeView(_view: View): void;
}
export declare class _TabbedLocation extends Location implements TabbedViewLocation {
    private tabbedPaneInternal;
    private readonly allowReorder;
    private readonly closeableTabSetting;
    private readonly tabOrderSetting;
    private readonly lastSelectedTabSetting;
    private readonly defaultTab;
    private readonly views;
    constructor(manager: ViewManager, revealCallback?: (() => void), location?: string, restoreSelection?: boolean, allowReorder?: boolean, defaultTab?: string | null);
    private setOrUpdateCloseableTabsSetting;
    widget(): Widget;
    tabbedPane(): TabbedPane;
    enableMoreTabsButton(): ToolbarMenuButton;
    appendApplicableItems(locationName: string): void;
    private appendTabsToMenu;
    private appendTab;
    appendView(view: View, insertBefore?: View | null): void;
    showView(view: View, insertBefore?: View | null, userGesture?: boolean, omitFocus?: boolean, shouldSelectTab?: boolean | undefined): Promise<void>;
    removeView(view: View): void;
    private tabSelected;
    private tabClosed;
    private persistTabOrder;
    getCloseableTabSetting(): Common.Settings.Setting<any>;
    static orderStep: number;
}
export { ViewRegistration, ViewPersistence, getRegisteredViewExtensions, maybeRemoveViewExtension, registerViewExtension, ViewLocationValues, getRegisteredLocationResolvers, registerLocationResolver, ViewLocationCategoryValues, resetViewRegistration, };
