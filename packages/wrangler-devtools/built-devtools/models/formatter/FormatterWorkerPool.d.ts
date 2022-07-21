import * as FormatterActions from '../../entrypoints/formatter_worker/FormatterActions.js';
export { DefinitionKind, type ScopeTreeNode } from '../../entrypoints/formatter_worker/FormatterActions.js';
export declare class FormatterWorkerPool {
    private taskQueue;
    private workerTasks;
    constructor();
    static instance(): FormatterWorkerPool;
    private createWorker;
    private processNextTask;
    private onWorkerMessage;
    private onWorkerError;
    private runChunkedTask;
    private runTask;
    format(mimeType: string, content: string, indentString: string): Promise<FormatterActions.FormatResult>;
    javaScriptIdentifiers(content: string): Promise<{
        name: string;
        offset: number;
    }[]>;
    javaScriptSubstitute(expression: string, mapping: Map<string, string>): Promise<string>;
    javaScriptScopeTree(expression: string): Promise<FormatterActions.ScopeTreeNode | null>;
    evaluatableJavaScriptSubstring(content: string): Promise<string>;
    parseCSS(content: string, callback: (arg0: boolean, arg1: Array<CSSRule>) => void): void;
    outlineForMimetype(content: string, mimeType: string, callback: (arg0: boolean, arg1: Array<OutlineItem>) => void): boolean;
    argumentsList(content: string): Promise<string[]>;
}
interface CSSProperty {
    name: string;
    nameRange: TextRange;
    value: string;
    valueRange: TextRange;
    range: TextRange;
    disabled?: boolean;
}
export declare function formatterWorkerPool(): FormatterWorkerPool;
export interface OutlineItem {
    line: number;
    column: number;
    title: string;
    subtitle?: string;
}
export interface CSSStyleRule {
    selectorText: string;
    styleRange: TextRange;
    lineNumber: number;
    columnNumber: number;
    properties: CSSProperty[];
}
export interface CSSAtRule {
    atRule: string;
    lineNumber: number;
    columnNumber: number;
}
export declare type CSSRule = CSSStyleRule | CSSAtRule;
export interface TextRange {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
}
