import * as LitHtml from '../../lit-html/lit-html.js';
import type * as Marked from '../../../third_party/marked/marked.js';
export interface MarkdownViewData {
    tokens: Marked.Marked.Token[];
}
export declare class MarkdownView extends HTMLElement {
    #private;
    static readonly litTagName: import("../../lit-html/static.js").Static;
    connectedCallback(): void;
    set data(data: MarkdownViewData);
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-markdown-view': MarkdownView;
    }
}
export declare const renderToken: (token: any) => LitHtml.TemplateResult;
