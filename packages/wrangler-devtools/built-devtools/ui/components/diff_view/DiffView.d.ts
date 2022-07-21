import * as Diff from '../../../third_party/diff/diff.js';
interface Token {
    text: string;
    className: string;
}
interface Row {
    originalLineNumber: number;
    currentLineNumber: number;
    tokens: Token[];
    type: RowType;
}
export declare const enum RowType {
    Deletion = "deletion",
    Addition = "addition",
    Equal = "equal",
    Spacer = "spacer"
}
export declare function buildDiffRows(diff: Diff.Diff.DiffArray): {
    originalLines: readonly string[];
    currentLines: readonly string[];
    rows: readonly Row[];
};
declare global {
    interface HTMLElementTagNameMap {
        'devtools-diff-view': DiffView;
    }
}
export declare type DiffViewData = {
    diff: Diff.Diff.DiffArray;
    mimeType: string;
};
export declare class DiffView extends HTMLElement {
    #private;
    static readonly litTagName: import("../../lit-html/static.js").Static;
    loaded: Promise<void>;
    constructor(data?: DiffViewData);
    set data(data: DiffViewData);
}
export {};
