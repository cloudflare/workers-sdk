import * as EventListeners from '../event_listeners/event_listeners.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class ObjectEventListenersSidebarPane extends UI.Widget.VBox implements UI.Toolbar.ItemsProvider {
    #private;
    private constructor();
    static instance(): ObjectEventListenersSidebarPane;
    get eventListenersView(): EventListeners.EventListenersView.EventListenersView;
    toolbarItems(): UI.Toolbar.ToolbarItem[];
    update(): void;
    wasShown(): void;
    willHide(): void;
    private windowObjectInContext;
    private refreshClick;
}
export declare const objectGroupName = "object-event-listeners-sidebar-pane";
