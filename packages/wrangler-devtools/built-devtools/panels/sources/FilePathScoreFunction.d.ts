export declare class FilePathScoreFunction {
    private query;
    private readonly queryUpperCase;
    private score;
    private sequence;
    private dataUpperCase;
    private fileNameIndex;
    constructor(query: string);
    calculateScore(data: string, matchIndexes: number[] | null): number;
    private testWordStart;
    private restoreMatchIndexes;
    private singleCharScore;
    private sequenceCharScore;
    private match;
}
