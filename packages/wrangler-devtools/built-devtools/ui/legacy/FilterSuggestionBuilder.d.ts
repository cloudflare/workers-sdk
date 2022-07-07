import type { Suggestion } from './SuggestBox.js';
export declare class FilterSuggestionBuilder {
    private readonly keys;
    private readonly valueSorter;
    private readonly valuesMap;
    constructor(keys: string[], valueSorter?: ((arg0: string, arg1: Array<string>) => void));
    completions(expression: string, prefix: string, force?: boolean): Promise<Suggestion[]>;
    addItem(key: string, value?: string | null): void;
    clear(): void;
}
