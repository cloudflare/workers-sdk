import * as LitHtml from '../../lit-html/lit-html.js';
export interface ExpandableListData {
    rows: LitHtml.TemplateResult[];
}
export declare class ExpandableList extends HTMLElement {
    #private;
    static readonly litTagName: import("../../lit-html/static.js").Static;
    set data(data: ExpandableListData);
    connectedCallback(): void;
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-expandable-list': ExpandableList;
    }
}
