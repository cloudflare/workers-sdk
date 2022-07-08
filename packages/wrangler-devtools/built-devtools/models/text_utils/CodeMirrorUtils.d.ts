declare type Tokenizer = (line: string, callback: (value: string, style: string | null) => void) => void;
export declare function createCssTokenizer(): Tokenizer;
export {};
