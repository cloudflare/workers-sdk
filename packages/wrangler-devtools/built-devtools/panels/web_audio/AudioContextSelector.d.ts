import * as Common from '../../core/common/common.js';
import * as UI from '../../ui/legacy/legacy.js';
import type * as Protocol from '../../generated/protocol.js';
export declare class AudioContextSelector extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements UI.SoftDropDown.Delegate<Protocol.WebAudio.BaseAudioContext> {
    private readonly placeholderText;
    private readonly items;
    private readonly dropDown;
    private readonly toolbarItemInternal;
    private selectedContextInternal;
    constructor();
    private onListItemReplaced;
    contextCreated({ data: context }: Common.EventTarget.EventTargetEvent<Protocol.WebAudio.BaseAudioContext>): void;
    contextDestroyed({ data: contextId }: Common.EventTarget.EventTargetEvent<string>): void;
    contextChanged({ data: changedContext }: Common.EventTarget.EventTargetEvent<Protocol.WebAudio.BaseAudioContext>): void;
    createElementForItem(item: Protocol.WebAudio.BaseAudioContext): Element;
    selectedContext(): Protocol.WebAudio.BaseAudioContext | null;
    highlightedItemChanged(from: Protocol.WebAudio.BaseAudioContext | null, to: Protocol.WebAudio.BaseAudioContext | null, fromElement: Element | null, toElement: Element | null): void;
    isItemSelectable(_item: Protocol.WebAudio.BaseAudioContext): boolean;
    itemSelected(item: Protocol.WebAudio.BaseAudioContext | null): void;
    reset(): void;
    titleFor(context: Protocol.WebAudio.BaseAudioContext): string;
    toolbarItem(): UI.Toolbar.ToolbarItem;
}
export declare const enum Events {
    ContextSelected = "ContextSelected"
}
export declare type EventTypes = {
    [Events.ContextSelected]: Protocol.WebAudio.BaseAudioContext | null;
};
