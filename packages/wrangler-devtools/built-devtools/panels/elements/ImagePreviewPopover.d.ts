import type * as Platform from '../../core/platform/platform.js';
import type * as SDK from '../../core/sdk/sdk.js';
/**
 * ImagePreviewPopover sets listeners on the container element to display
 * an image preview if needed. The image URL comes from the event (mouseover) target
 * in a propery identified by HrefSymbol. To enable preview for any child element
 * set the property HrefSymbol.
 */
export declare class ImagePreviewPopover {
    private readonly getLinkElement;
    private readonly getDOMNode;
    private readonly popover;
    constructor(container: Element, getLinkElement: (arg0: Event) => Element | null, getDOMNode: (arg0: Element) => SDK.DOMModel.DOMNode | null);
    private handleRequest;
    hide(): void;
    static setImageUrl(element: Element, url: Platform.DevToolsPath.UrlString): Element;
    static getImageURL(element: Element): Platform.DevToolsPath.UrlString | undefined;
}
