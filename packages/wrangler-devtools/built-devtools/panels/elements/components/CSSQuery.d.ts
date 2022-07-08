export interface CSSQueryData {
    queryPrefix: string;
    queryName?: string;
    queryText: string;
    onQueryTextClick?: (event: Event) => void;
}
export declare class CSSQuery extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    set data(data: CSSQueryData);
    connectedCallback(): void;
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-css-query': CSSQuery;
    }
}
