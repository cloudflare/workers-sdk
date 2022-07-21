import * as Workspace from '../../../models/workspace/workspace.js';
import * as UI from '../../../ui/legacy/legacy.js';
export declare class HeadersView extends UI.View.SimpleView {
    #private;
    constructor(uiSourceCode: Workspace.UISourceCode.UISourceCode);
    commitEditing(): void;
    getComponent(): HeadersViewComponent;
    dispose(): void;
}
declare type Header = {
    name: string;
    value: string;
};
declare type HeaderOverride = {
    applyTo: string;
    headers: Header[];
};
export interface HeadersViewComponentData {
    headerOverrides: HeaderOverride[];
    uiSourceCode: Workspace.UISourceCode.UISourceCode;
    parsingError: boolean;
}
export declare class HeadersViewComponent extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    constructor();
    connectedCallback(): void;
    set data(data: HeadersViewComponentData);
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-sources-headers-view': HeadersViewComponent;
    }
}
export {};
