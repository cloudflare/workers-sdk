export declare class Trie {
    #private;
    constructor();
    add(word: string): void;
    remove(word: string): boolean;
    has(word: string): boolean;
    words(prefix?: string): string[];
    private dfs;
    longestPrefix(word: string, fullWordOnly: boolean): string;
    clear(): void;
}
