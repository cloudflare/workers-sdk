import * as SDK from '../../core/sdk/sdk.js';
import * as Components from '../../ui/legacy/components/utils/utils.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class EventListenersView extends UI.Widget.VBox {
    private changeCallback;
    private enableDefaultTreeFocus;
    treeOutline: UI.TreeOutline.TreeOutlineInShadow;
    private emptyHolder;
    private linkifier;
    private readonly treeItemMap;
    constructor(changeCallback: () => void, enableDefaultTreeFocus?: boolean | undefined);
    focus(): void;
    addObjects(objects: (SDK.RemoteObject.RemoteObject | null)[]): Promise<void>;
    private addObject;
    private addObjectEventListeners;
    showFrameworkListeners(showFramework: boolean, showPassive: boolean, showBlocking: boolean): void;
    private getOrCreateTreeElementForType;
    addEmptyHolderIfNeeded(): void;
    reset(): void;
    private eventListenersArrivedForTest;
    wasShown(): void;
}
export declare class EventListenersTreeElement extends UI.TreeOutline.TreeElement {
    toggleOnClick: boolean;
    private readonly linkifier;
    private readonly changeCallback;
    constructor(type: string, linkifier: Components.Linkifier.Linkifier, changeCallback: () => void);
    static comparator(element1: UI.TreeOutline.TreeElement, element2: UI.TreeOutline.TreeElement): number;
    addObjectEventListener(eventListener: SDK.DOMDebuggerModel.EventListener, object: SDK.RemoteObject.RemoteObject): void;
}
export declare class ObjectEventListenerBar extends UI.TreeOutline.TreeElement {
    private eventListenerInternal;
    editable: boolean;
    private readonly changeCallback;
    private valueTitle?;
    constructor(eventListener: SDK.DOMDebuggerModel.EventListener, object: SDK.RemoteObject.RemoteObject, linkifier: Components.Linkifier.Linkifier, changeCallback: () => void);
    onpopulate(): Promise<void>;
    private setTitle;
    private removeListener;
    private togglePassiveListener;
    private removeListenerBar;
    eventListener(): SDK.DOMDebuggerModel.EventListener;
    onenter(): boolean;
    ondelete(): boolean;
}
