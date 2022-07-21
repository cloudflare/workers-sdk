import { VBox } from './Widget.js';
export declare class ListWidget<T> extends VBox {
    private delegate;
    private readonly list;
    private lastSeparator;
    private focusRestorer;
    private items;
    private editable;
    private elements;
    private editor;
    private editItem;
    private editElement;
    private emptyPlaceholder;
    constructor(delegate: Delegate<T>, delegatesFocus?: boolean | undefined);
    clear(): void;
    appendItem(item: T, editable: boolean): void;
    appendSeparator(): void;
    removeItem(index: number): void;
    addNewItem(index: number, item: T): void;
    setEmptyPlaceholder(element: Element | null): void;
    private createControls;
    wasShown(): void;
    private updatePlaceholder;
    private startEditing;
    private commitEditing;
    private stopEditing;
}
export interface Delegate<T> {
    renderItem(item: T, editable: boolean): Element;
    removeItemRequested(item: T, index: number): void;
    beginEdit(item: T): Editor<T>;
    commitEdit(item: T, editor: Editor<T>, isNew: boolean): void;
}
export interface CustomEditorControl<T> extends HTMLElement {
    value: T;
    validate: () => ValidatorResult;
}
export declare type EditorControl<T = string> = (HTMLInputElement | HTMLSelectElement | CustomEditorControl<T>);
export declare class Editor<T> {
    element: HTMLDivElement;
    private readonly contentElementInternal;
    private commitButton;
    private readonly cancelButton;
    private errorMessageContainer;
    private readonly controls;
    private readonly controlByName;
    private readonly validators;
    private commit;
    private cancel;
    private item;
    private index;
    constructor();
    contentElement(): Element;
    createInput(name: string, type: string, title: string, validator: (arg0: T, arg1: number, arg2: EditorControl) => ValidatorResult): HTMLInputElement;
    createSelect(name: string, options: string[], validator: (arg0: T, arg1: number, arg2: EditorControl) => ValidatorResult, title?: string): HTMLSelectElement;
    createCustomControl<S, U extends CustomEditorControl<S>>(name: string, ctor: {
        new (): U;
    }, validator: (arg0: T, arg1: number, arg2: EditorControl) => ValidatorResult): CustomEditorControl<S>;
    control(name: string): EditorControl;
    private validateControls;
    requestValidation(): void;
    beginEdit(item: T, index: number, commitButtonTitle: string, commit: () => void, cancel: () => void): void;
    private commitClicked;
    private cancelClicked;
}
export interface ValidatorResult {
    valid: boolean;
    errorMessage?: string;
}
