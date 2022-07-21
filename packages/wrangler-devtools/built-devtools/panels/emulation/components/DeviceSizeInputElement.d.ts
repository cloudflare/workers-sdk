import type * as Platform from '../../../core/platform/platform.js';
declare class SizeChangedEvent extends Event {
    size: number;
    static readonly eventName = "sizechanged";
    constructor(size: number);
}
export declare class SizeInputElement extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    constructor(title: Platform.UIString.LocalizedString);
    connectedCallback(): void;
    set disabled(disabled: boolean);
    set size(size: string);
    set placeholder(placeholder: string);
    render(): void;
}
declare global {
    interface HTMLElementTagNameMap {
        'device-mode-emulation-size-input': SizeInputElement;
    }
    interface HTMLElementEventMap {
        'sizechanged': SizeChangedEvent;
    }
}
export {};
