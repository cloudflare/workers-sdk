import * as SDK from '../../../core/sdk/sdk.js';
import * as UI from '../../../ui/legacy/legacy.js';
export declare class BackForwardCacheViewWrapper extends UI.ThrottledWidget.ThrottledWidget {
    #private;
    constructor();
    doUpdate(): Promise<void>;
}
export interface BackForwardCacheViewData {
    frame: SDK.ResourceTreeModel.ResourceTreeFrame | null;
}
export declare class BackForwardCacheView extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    connectedCallback(): void;
    set data(data: BackForwardCacheViewData);
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-resources-back-forward-cache-view': BackForwardCacheView;
    }
}
