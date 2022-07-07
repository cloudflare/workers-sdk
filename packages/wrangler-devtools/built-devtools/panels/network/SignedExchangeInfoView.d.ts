import type * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class SignedExchangeInfoView extends UI.Widget.VBox {
    private readonly responseHeadersItem?;
    constructor(request: SDK.NetworkRequest.NetworkRequest);
    private formatHeader;
    private formatHeaderForHexData;
    wasShown(): void;
}
export declare class Category extends UI.TreeOutline.TreeElement {
    toggleOnClick: boolean;
    expanded: boolean;
    constructor(root: UI.TreeOutline.TreeOutline, title?: string | Node);
    createLeaf(title?: string | Node): UI.TreeOutline.TreeElement;
}
