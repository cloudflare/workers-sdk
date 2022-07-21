export declare class CategorizedBreakpoint {
    #private;
    titleInternal: string;
    enabledInternal: boolean;
    constructor(category: string, title: string);
    category(): string;
    enabled(): boolean;
    setEnabled(enabled: boolean): void;
    title(): string;
    setTitle(title: string): void;
}
