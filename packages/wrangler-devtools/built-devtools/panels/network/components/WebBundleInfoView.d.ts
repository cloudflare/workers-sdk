import type * as SDK from '../../../core/sdk/sdk.js';
import * as UI from '../../../ui/legacy/legacy.js';
export declare class WebBundleInfoView extends UI.Widget.VBox {
    constructor(request: SDK.NetworkRequest.NetworkRequest);
}
export declare class WebBundleInfoElement extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    constructor(webBundleInfo: SDK.NetworkRequest.WebBundleInfo, webBundleName: string);
    connectedCallback(): void;
    render(): void;
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-web-bundle-info': WebBundleInfoElement;
    }
}
