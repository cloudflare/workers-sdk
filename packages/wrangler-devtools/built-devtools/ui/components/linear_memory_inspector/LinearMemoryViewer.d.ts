import type { HighlightInfo } from './LinearMemoryViewerUtils.js';
export interface LinearMemoryViewerData {
    memory: Uint8Array;
    address: number;
    memoryOffset: number;
    focus: boolean;
    highlightInfo?: HighlightInfo;
}
export declare class ByteSelectedEvent extends Event {
    static readonly eventName = "byteselected";
    data: number;
    constructor(address: number);
}
export declare class ResizeEvent extends Event {
    static readonly eventName = "resize";
    data: number;
    constructor(numBytesPerPage: number);
}
export declare class LinearMemoryViewer extends HTMLElement {
    #private;
    static readonly litTagName: import("../../lit-html/static.js").Static;
    set data(data: LinearMemoryViewerData);
    connectedCallback(): void;
    disconnectedCallback(): void;
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-linear-memory-inspector-viewer': LinearMemoryViewer;
    }
}
