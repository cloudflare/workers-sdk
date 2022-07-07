import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { Database } from './DatabaseModel.js';
declare const DatabaseQueryView_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<EventTypes>;
    addEventListener<T extends Events.SchemaUpdated>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<EventTypes, T>;
    once<T_1 extends Events.SchemaUpdated>(eventType: T_1): Promise<EventTypes[T_1]>;
    removeEventListener<T_2 extends Events.SchemaUpdated>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: Events.SchemaUpdated): boolean;
    dispatchEventToListeners<T_3 extends Events.SchemaUpdated>(eventType: Platform.TypeScriptUtilities.NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<EventTypes, T_3>): void;
}) & typeof UI.Widget.VBox;
export declare class DatabaseQueryView extends DatabaseQueryView_base {
    database: Database;
    private queryWrapper;
    private readonly promptContainer;
    private readonly promptElement;
    private prompt;
    private readonly proxyElement;
    private queryResults;
    private virtualSelectedIndex;
    private lastSelectedElement;
    private selectionTimeout;
    constructor(database: Database);
    private messagesClicked;
    private onKeyDown;
    private onFocusIn;
    private onFocusOut;
    private isOutsideViewport;
    private updateFocusedItem;
    completions(_expression: string, prefix: string, _force?: boolean): Promise<UI.SuggestBox.Suggestions>;
    private selectStart;
    private promptKeyDown;
    private enterKeyPressed;
    private queryFinished;
    private appendViewQueryResult;
    private appendErrorQueryResult;
    private scrollResultIntoView;
    private appendQueryResult;
}
export declare enum Events {
    SchemaUpdated = "SchemaUpdated"
}
export declare type EventTypes = {
    [Events.SchemaUpdated]: Database;
};
export declare const SQL_BUILT_INS: string[];
export {};
