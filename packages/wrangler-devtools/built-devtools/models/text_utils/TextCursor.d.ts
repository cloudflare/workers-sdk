export declare class TextCursor {
    private lineEndings;
    private offsetInternal;
    private lineNumberInternal;
    private columnNumberInternal;
    constructor(lineEndings: number[]);
    advance(offset: number): void;
    offset(): number;
    resetTo(offset: number): void;
    lineNumber(): number;
    columnNumber(): number;
}
