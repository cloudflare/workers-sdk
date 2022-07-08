import * as TextUtils from '../../models/text_utils/text_utils.js';
import type * as Common from '../common/common.js';
import type * as Platform from '../platform/platform.js';
import type { PageResourceLoadInitiator } from './PageResourceLoader.js';
export declare class CompilerSourceMappingContentProvider implements TextUtils.ContentProvider.ContentProvider {
    #private;
    constructor(sourceURL: Platform.DevToolsPath.UrlString, contentType: Common.ResourceType.ResourceType, initiator: PageResourceLoadInitiator);
    contentURL(): Platform.DevToolsPath.UrlString;
    contentType(): Common.ResourceType.ResourceType;
    contentEncoded(): Promise<boolean>;
    requestContent(): Promise<TextUtils.ContentProvider.DeferredContent>;
    searchInContent(query: string, caseSensitive: boolean, isRegex: boolean): Promise<TextUtils.ContentProvider.SearchMatch[]>;
}
