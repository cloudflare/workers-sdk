import * as Common from '../../../core/common/common.js';
import * as SDK from '../../../core/sdk/sdk.js';
import * as UI from '../../../ui/legacy/legacy.js';
export declare class RequestHeadersView extends UI.Widget.VBox {
    #private;
    constructor(request: SDK.NetworkRequest.NetworkRequest);
    wasShown(): void;
    willHide(): void;
}
export interface RequestHeadersComponentData {
    request: SDK.NetworkRequest.NetworkRequest;
}
export declare class RequestHeadersComponent extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    set data(data: RequestHeadersComponentData);
    connectedCallback(): void;
}
export declare class ToggleRawHeadersEvent extends Event {
    static readonly eventName = "togglerawevent";
    constructor();
}
export interface CategoryData {
    name: string;
    title: Common.UIString.LocalizedString;
    headerCount?: number;
    checked?: boolean;
}
export declare class Category extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    connectedCallback(): void;
    set data(data: CategoryData);
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-request-headers': RequestHeadersComponent;
        'devtools-request-headers-category': Category;
    }
}
