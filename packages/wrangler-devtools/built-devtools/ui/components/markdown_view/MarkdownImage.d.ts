export interface MarkdownImageData {
    key: string;
    title: string;
}
/**
 * Component to render images from parsed markdown.
 * Parsed images from markdown are not directly rendered, instead they have to be added to the MarkdownImagesMap.ts.
 * This makes sure that all icons/images are accounted for in markdown.
 */
export declare class MarkdownImage extends HTMLElement {
    #private;
    static readonly litTagName: import("../../lit-html/static.js").Static;
    constructor();
    connectedCallback(): void;
    set data(data: MarkdownImageData);
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-markdown-image': MarkdownImage;
    }
}
