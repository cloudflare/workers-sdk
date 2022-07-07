import type * as CodeMirror from '../../../third_party/codemirror.next/codemirror.next.js';
export declare function toOffset(doc: CodeMirror.Text, { lineNumber, columnNumber }: {
    lineNumber: number;
    columnNumber: number;
}): number;
export declare function toLineColumn(doc: CodeMirror.Text, offset: number): {
    lineNumber: number;
    columnNumber: number;
};
