import type * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import type * as Workspace from '../../models/workspace/workspace.js';
export declare class SearchConfig implements Workspace.Workspace.ProjectSearchConfig {
    private readonly queryInternal;
    private readonly ignoreCaseInternal;
    private readonly isRegexInternal;
    private fileQueries?;
    private queriesInternal?;
    private fileRegexQueries?;
    constructor(query: string, ignoreCase: boolean, isRegex: boolean);
    static fromPlainObject(object: {
        query: string;
        ignoreCase: boolean;
        isRegex: boolean;
    }): SearchConfig;
    query(): string;
    ignoreCase(): boolean;
    isRegex(): boolean;
    toPlainObject(): {
        query: string;
        ignoreCase: boolean;
        isRegex: boolean;
    };
    private parse;
    filePathMatchesFileQuery(filePath: Platform.DevToolsPath.RawPathString | Platform.DevToolsPath.EncodedPathString | Platform.DevToolsPath.UrlString): boolean;
    queries(): string[];
    private parseUnquotedQuery;
    private parseQuotedQuery;
    private parseFileQuery;
}
export declare const FilePatternRegex: RegExp;
export declare class QueryTerm {
    text: string;
    isNegative: boolean;
    constructor(text: string, isNegative: boolean);
}
export interface SearchResult {
    label(): string;
    description(): string;
    matchesCount(): number;
    matchLabel(index: number): string;
    matchLineContent(index: number): string;
    matchRevealable(index: number): Object;
}
export interface SearchScope {
    performSearch(searchConfig: SearchConfig, progress: Common.Progress.Progress, searchResultCallback: (arg0: SearchResult) => void, searchFinishedCallback: (arg0: boolean) => void): void | Promise<void>;
    performIndexing(progress: Common.Progress.Progress): void;
    stopSearch(): void;
}
export interface RegexQuery {
    regex: RegExp;
    isNegative: boolean;
}
