import * as CodeMirror from '../../../third_party/codemirror.next/codemirror.next.js';
export declare const highlightStyle: CodeMirror.HighlightStyle;
export declare function create(code: string, mimeType: string): Promise<CodeHighlighter>;
export declare function highlightNode(node: Element, mimeType: string): Promise<void>;
export declare function languageFromMIME(mimeType: string): Promise<CodeMirror.LanguageSupport | null>;
export declare class CodeHighlighter {
    readonly code: string;
    readonly tree: CodeMirror.Tree;
    constructor(code: string, tree: CodeMirror.Tree);
    highlight(token: (text: string, style: string) => void): void;
    highlightRange(from: number, to: number, token: (text: string, style: string) => void): void;
}
