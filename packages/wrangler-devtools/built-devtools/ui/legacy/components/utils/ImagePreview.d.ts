import * as Platform from '../../../../core/platform/platform.js';
import * as SDK from '../../../../core/sdk/sdk.js';
export interface PrecomputedFeatures {
    renderedWidth: number;
    renderedHeight: number;
    currentSrc?: Platform.DevToolsPath.UrlString;
}
export declare class ImagePreview {
    static build(target: SDK.Target.Target, originalImageURL: Platform.DevToolsPath.UrlString, showDimensions: boolean, options?: {
        precomputedFeatures: (PrecomputedFeatures | undefined);
        imageAltText: (string | undefined);
    } | undefined): Promise<Element | null>;
    static loadDimensionsForNode(node: SDK.DOMModel.DOMNode): Promise<PrecomputedFeatures | undefined>;
    static defaultAltTextForImageURL(url: Platform.DevToolsPath.UrlString): string;
}
