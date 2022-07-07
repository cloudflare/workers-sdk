import * as TextUtils from '../../models/text_utils/text_utils.js';
import * as Common from '../common/common.js';
import * as Platform from '../platform/platform.js';
import type { PageResourceLoadInitiator } from './PageResourceLoader.js';
export interface SourceMap {
    compiledURL(): Platform.DevToolsPath.UrlString;
    url(): Platform.DevToolsPath.UrlString;
    sourceURLs(): Platform.DevToolsPath.UrlString[];
    sourceContentProvider(sourceURL: Platform.DevToolsPath.UrlString, contentType: Common.ResourceType.ResourceType): TextUtils.ContentProvider.ContentProvider;
    embeddedContentByURL(sourceURL: Platform.DevToolsPath.UrlString): string | null;
    findEntry(lineNumber: number, columnNumber: number): SourceMapEntry | null;
    findEntryRanges(lineNumber: number, columnNumber: number): {
        range: TextUtils.TextRange.TextRange;
        sourceRange: TextUtils.TextRange.TextRange;
        sourceURL: Platform.DevToolsPath.UrlString;
    } | null;
    findReverseRanges(sourceURL: Platform.DevToolsPath.UrlString, lineNumber: number, columnNumber: number): TextUtils.TextRange.TextRange[];
    sourceLineMapping(sourceURL: Platform.DevToolsPath.UrlString, lineNumber: number, columnNumber: number): SourceMapEntry | null;
    mappings(): SourceMapEntry[];
    mapsOrigin(): boolean;
}
export declare class SourceMapV3 {
    version: number;
    file: string | undefined;
    sources: Platform.DevToolsPath.UrlString[];
    sections: Section[] | undefined;
    mappings: string;
    sourceRoot: Platform.DevToolsPath.UrlString | undefined;
    names: string[] | undefined;
    sourcesContent: string | undefined;
    constructor();
}
export declare class Section {
    map: SourceMapV3;
    offset: Offset;
    url: Platform.DevToolsPath.UrlString | undefined;
    constructor();
}
export declare class Offset {
    line: number;
    column: number;
    constructor();
}
export declare class SourceMapEntry {
    lineNumber: number;
    columnNumber: number;
    sourceURL: Platform.DevToolsPath.UrlString | undefined;
    sourceLineNumber: number;
    sourceColumnNumber: number;
    name: string | undefined;
    constructor(lineNumber: number, columnNumber: number, sourceURL?: Platform.DevToolsPath.UrlString, sourceLineNumber?: number, sourceColumnNumber?: number, name?: string);
    static compare(entry1: SourceMapEntry, entry2: SourceMapEntry): number;
}
export declare class TextSourceMap implements SourceMap {
    #private;
    /**
     * Implements Source Map V3 model. See https://github.com/google/closure-compiler/wiki/Source-Maps
     * for format description.
     */
    constructor(compiledURL: Platform.DevToolsPath.UrlString, sourceMappingURL: Platform.DevToolsPath.UrlString, payload: SourceMapV3, initiator: PageResourceLoadInitiator);
    /**
     * @throws {!Error}
     */
    static load(sourceMapURL: Platform.DevToolsPath.UrlString, compiledURL: Platform.DevToolsPath.UrlString, initiator: PageResourceLoadInitiator): Promise<TextSourceMap>;
    compiledURL(): Platform.DevToolsPath.UrlString;
    url(): Platform.DevToolsPath.UrlString;
    sourceURLs(): Platform.DevToolsPath.UrlString[];
    sourceContentProvider(sourceURL: Platform.DevToolsPath.UrlString, contentType: Common.ResourceType.ResourceType): TextUtils.ContentProvider.ContentProvider;
    embeddedContentByURL(sourceURL: Platform.DevToolsPath.UrlString): string | null;
    findEntry(lineNumber: number, columnNumber: number): SourceMapEntry | null;
    findEntryRanges(lineNumber: number, columnNumber: number): {
        range: TextUtils.TextRange.TextRange;
        sourceRange: TextUtils.TextRange.TextRange;
        sourceURL: Platform.DevToolsPath.UrlString;
    } | null;
    sourceLineMapping(sourceURL: Platform.DevToolsPath.UrlString, lineNumber: number, columnNumber: number): SourceMapEntry | null;
    private findReverseIndices;
    findReverseEntries(sourceURL: Platform.DevToolsPath.UrlString, lineNumber: number, columnNumber: number): SourceMapEntry[];
    findReverseRanges(sourceURL: Platform.DevToolsPath.UrlString, lineNumber: number, columnNumber: number): TextUtils.TextRange.TextRange[];
    mappings(): SourceMapEntry[];
    private reversedMappings;
    private eachSection;
    private parseSources;
    private parseMap;
    private isSeparator;
    private decodeVLQ;
    reverseMapTextRange(url: Platform.DevToolsPath.UrlString, textRange: TextUtils.TextRange.TextRange): TextUtils.TextRange.TextRange | null;
    mapsOrigin(): boolean;
}
export declare namespace TextSourceMap {
    const _VLQ_BASE_SHIFT = 5;
    const _VLQ_BASE_MASK: number;
    const _VLQ_CONTINUATION_MASK: number;
    class StringCharIterator {
        private readonly string;
        private position;
        constructor(string: string);
        next(): string;
        peek(): string;
        hasNext(): boolean;
    }
    class SourceInfo {
        content: string | null;
        reverseMappings: number[] | null;
        constructor(content: string | null);
    }
}
