import type * as Common from '../../core/common/common.js';
import * as DOMPinnedProperties from './DOMPinnedProperties.js';
export declare class JavaScriptMetadataImpl implements Common.JavaScriptMetaData.JavaScriptMetaData {
    static readonly domPinnedProperties: typeof DOMPinnedProperties;
    private readonly uniqueFunctions;
    private readonly receiverMethods;
    static instance(opts?: {
        forceNew: boolean | null;
    }): JavaScriptMetadataImpl;
    constructor();
    signaturesForNativeFunction(name: string): string[][] | null;
    signaturesForInstanceMethod(name: string, receiverClassName: string): string[][] | null;
    signaturesForStaticMethod(name: string, receiverConstructorName: string): string[][] | null;
}
