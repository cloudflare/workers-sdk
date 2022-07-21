import * as Platform from '../../../core/platform/platform.js';
export interface LinkifierData {
    url: Platform.DevToolsPath.UrlString;
    lineNumber?: number;
    columnNumber?: number;
}
export declare class LinkifierClick extends Event {
    data: LinkifierData;
    static readonly eventName = "linkifieractivated";
    constructor(data: LinkifierData);
}
export declare class Linkifier extends HTMLElement {
    #private;
    static readonly litTagName: import("../../lit-html/static.js").Static;
    set data(data: LinkifierData);
    connectedCallback(): void;
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-linkifier': Linkifier;
    }
}
