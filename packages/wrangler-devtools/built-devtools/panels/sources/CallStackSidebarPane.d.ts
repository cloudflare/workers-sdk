import * as SDK from '../../core/sdk/sdk.js';
import * as Bindings from '../../models/bindings/bindings.js';
import * as Workspace from '../../models/workspace/workspace.js';
import * as UI from '../../ui/legacy/legacy.js';
import type * as Protocol from '../../generated/protocol.js';
export declare class CallStackSidebarPane extends UI.View.SimpleView implements UI.ContextFlavorListener.ContextFlavorListener, UI.ListControl.ListDelegate<Item> {
    private readonly ignoreListMessageElement;
    private readonly notPausedMessageElement;
    private readonly callFrameWarningsElement;
    private readonly items;
    private list;
    private readonly showMoreMessageElement;
    private showIgnoreListed;
    private readonly locationPool;
    private readonly updateThrottler;
    private maxAsyncStackChainDepth;
    private readonly updateItemThrottler;
    private readonly scheduledForUpdateItems;
    private muteActivateItem?;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): CallStackSidebarPane;
    flavorChanged(_object: Object | null): void;
    private update;
    private doUpdate;
    private updatedForTest;
    private refreshItem;
    createElementForItem(item: Item): Element;
    heightForItem(_item: Item): number;
    isItemSelectable(_item: Item): boolean;
    selectedItemChanged(_from: Item | null, _to: Item | null, fromElement: HTMLElement | null, toElement: HTMLElement | null): void;
    updateSelectedItemARIA(_fromElement: Element | null, _toElement: Element | null): boolean;
    private createIgnoreListMessageElement;
    private createShowMoreMessageElement;
    private onContextMenu;
    private onClick;
    private activateItem;
    activeCallFrameItem(): Item | null;
    appendIgnoreListURLContextMenuItems(contextMenu: UI.ContextMenu.ContextMenu, uiSourceCode: Workspace.UISourceCode.UISourceCode): void;
    selectNextCallFrameOnStack(): void;
    selectPreviousCallFrameOnStack(): void;
    private copyStackTrace;
    wasShown(): void;
}
export declare const elementSymbol: unique symbol;
export declare const defaultMaxAsyncStackChainDepth = 32;
export declare class ActionDelegate implements UI.ActionRegistration.ActionDelegate {
    static instance(opts?: {
        forceNew: boolean | null;
    }): ActionDelegate;
    handleAction(context: UI.Context.Context, actionId: string): boolean;
}
export declare class Item {
    isIgnoreListed: boolean;
    title: string;
    linkText: string;
    uiLocation: Workspace.UISourceCode.UILocation | null;
    isAsyncHeader: boolean;
    updateDelegate: (arg0: Item) => void;
    static createForDebuggerCallFrame(frame: SDK.DebuggerModel.CallFrame, locationPool: Bindings.LiveLocation.LiveLocationPool, updateDelegate: (arg0: Item) => void): Promise<Item>;
    static createItemsForAsyncStack(title: string, debuggerModel: SDK.DebuggerModel.DebuggerModel, frames: Protocol.Runtime.CallFrame[], locationPool: Bindings.LiveLocation.LiveLocationPool, updateDelegate: (arg0: Item) => void): Promise<Item[]>;
    constructor(title: string, updateDelegate: (arg0: Item) => void);
    private update;
}
