import type * as Common from '../../../../core/common/common.js';
import type * as Platform from '../../../../core/platform/platform.js';
import * as TextUtils from '../../../../models/text_utils/text_utils.js';
import { ResourceSourceFrame } from './ResourceSourceFrame.js';
export declare class BinaryResourceViewFactory {
    private base64content;
    private readonly contentUrl;
    private readonly resourceType;
    private arrayPromise;
    private hexPromise;
    private utf8Promise;
    constructor(base64content: string, contentUrl: Platform.DevToolsPath.UrlString, resourceType: Common.ResourceType.ResourceType);
    private fetchContentAsArray;
    hex(): Promise<TextUtils.ContentProvider.DeferredContent>;
    base64(): Promise<TextUtils.ContentProvider.DeferredContent>;
    utf8(): Promise<TextUtils.ContentProvider.DeferredContent>;
    createBase64View(): ResourceSourceFrame;
    createHexView(): ResourceSourceFrame;
    createUtf8View(): ResourceSourceFrame;
    static uint8ArrayToHexString(uint8Array: Uint8Array): string;
    static numberToHex(number: number, padding: number): string;
    static uint8ArrayToHexViewer(array: Uint8Array): string;
}
