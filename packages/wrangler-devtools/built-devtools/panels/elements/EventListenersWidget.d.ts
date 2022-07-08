import * as UI from '../../ui/legacy/legacy.js';
export declare class EventListenersWidget extends UI.ThrottledWidget.ThrottledWidget implements UI.Toolbar.ItemsProvider {
    private readonly toolbarItemsInternal;
    private showForAncestorsSetting;
    private readonly dispatchFilterBySetting;
    private readonly showFrameworkListenersSetting;
    private readonly eventListenersView;
    private lastRequestedNode?;
    constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    } | undefined): EventListenersWidget;
    doUpdate(): Promise<void>;
    toolbarItems(): UI.Toolbar.ToolbarItem[];
    private onDispatchFilterTypeChanged;
    private showFrameworkListenersChanged;
    private windowObjectInNodeContext;
    eventListenersArrivedForTest(): void;
}
export declare const DispatchFilterBy: {
    All: string;
    Blocking: string;
    Passive: string;
};
