import type * as Platform from '../../core/platform/platform.js';
import { VBox } from './Widget.js';
export declare class EmptyWidget extends VBox {
    private textElement;
    constructor(text: string);
    appendParagraph(): Element;
    appendLink(link: Platform.DevToolsPath.UrlString): HTMLElement;
    set text(text: string);
}
