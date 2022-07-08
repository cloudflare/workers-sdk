import * as CodeMirror from '../../../third_party/codemirror.next/codemirror.next.js';
declare global {
    interface HTMLElementTagNameMap {
        'devtools-text-editor': TextEditor;
    }
}
export declare class TextEditor extends HTMLElement {
    #private;
    static readonly litTagName: import("../../lit-html/static.js").Static;
    constructor(pendingState?: CodeMirror.EditorState);
    get editor(): CodeMirror.EditorView;
    dispatch(spec: CodeMirror.TransactionSpec): void;
    get state(): CodeMirror.EditorState;
    set state(state: CodeMirror.EditorState);
    connectedCallback(): void;
    disconnectedCallback(): void;
    focus(): void;
    revealPosition(selection: CodeMirror.EditorSelection, highlight?: boolean): void;
    createSelection(head: {
        lineNumber: number;
        columnNumber: number;
    }, anchor?: {
        lineNumber: number;
        columnNumber: number;
    }): CodeMirror.EditorSelection;
    toLineColumn(pos: number): {
        lineNumber: number;
        columnNumber: number;
    };
    toOffset(pos: {
        lineNumber: number;
        columnNumber: number;
    }): number;
}
