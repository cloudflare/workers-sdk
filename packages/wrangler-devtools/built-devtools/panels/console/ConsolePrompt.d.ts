import * as Common from '../../core/common/common.js';
import * as UI from '../../ui/legacy/legacy.js';
declare const ConsolePrompt_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<EventTypes>;
    addEventListener<T extends Events.TextChanged>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<EventTypes, T>;
    once<T_1 extends Events.TextChanged>(eventType: T_1): Promise<EventTypes[T_1]>;
    removeEventListener<T_2 extends Events.TextChanged>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: Events.TextChanged): boolean;
    dispatchEventToListeners<T_3 extends Events.TextChanged>(eventType: import("../../core/platform/typescript-utilities.js").NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<EventTypes, T_3>): void;
}) & typeof UI.Widget.Widget;
export declare class ConsolePrompt extends ConsolePrompt_base {
    #private;
    private addCompletionsFromHistory;
    private historyInternal;
    private initialText;
    private editor;
    private readonly eagerPreviewElement;
    private textChangeThrottler;
    private readonly formatter;
    private requestPreviewBound;
    private requestPreviewCurrent;
    private readonly innerPreviewElement;
    private readonly promptIcon;
    private readonly iconThrottler;
    private readonly eagerEvalSetting;
    private previewRequestForTest;
    private highlightingNode;
    constructor();
    private eagerSettingChanged;
    belowEditorElement(): Element;
    private onTextChanged;
    private requestPreview;
    wasShown(): void;
    willHide(): void;
    history(): ConsoleHistoryManager;
    clearAutocomplete(): void;
    private isCaretAtEndOfPrompt;
    moveCaretToEndOfPrompt(): void;
    clear(): void;
    text(): string;
    setAddCompletionsFromHistory(value: boolean): void;
    private editorKeymap;
    private moveHistory;
    private enterWillEvaluate;
    private handleEnter;
    private updatePromptIcon;
    private appendCommand;
    private evaluateCommandInConsole;
    private substituteNames;
    private editorUpdate;
    private historyCompletions;
    focus(): void;
    private editorSetForTest;
}
export declare class ConsoleHistoryManager {
    private data;
    private historyOffset;
    private uncommittedIsTop?;
    constructor();
    historyData(): string[];
    setHistoryData(data: string[]): void;
    /**
     * Pushes a committed text into the history.
     */
    pushHistoryItem(text: string): void;
    /**
     * Pushes the current (uncommitted) text into the history.
     */
    private pushCurrentText;
    previous(currentText: string): string | undefined;
    next(): string | undefined;
    private currentHistoryItem;
}
export declare const enum Events {
    TextChanged = "TextChanged"
}
export declare type EventTypes = {
    [Events.TextChanged]: void;
};
export {};
