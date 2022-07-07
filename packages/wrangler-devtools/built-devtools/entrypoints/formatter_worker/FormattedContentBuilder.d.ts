export declare class FormattedContentBuilder {
    #private;
    private indentString;
    mapping: {
        original: number[];
        formatted: number[];
    };
    constructor(indentString: string);
    setEnforceSpaceBetweenWords(value: boolean): boolean;
    addToken(token: string, offset: number): void;
    addSoftSpace(): void;
    addHardSpace(): void;
    addNewLine(noSquash?: boolean): void;
    increaseNestingLevel(): void;
    decreaseNestingLevel(): void;
    content(): string;
}
