import * as Platform from '../../../core/platform/platform.js';
export interface ProtocolHandler {
    protocol: string;
    url: string;
}
export interface ProtocolHandlersData {
    protocolHandlers: ProtocolHandler[];
    manifestLink: Platform.DevToolsPath.UrlString;
}
export declare class ProtocolHandlersView extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    set data(data: ProtocolHandlersData);
    connectedCallback(): void;
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-protocol-handlers-view': ProtocolHandlersView;
    }
}
