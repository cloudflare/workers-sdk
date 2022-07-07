export interface IconWithTextData {
    iconName: string;
    iconColor?: string;
    iconWidth?: string;
    iconHeight?: string;
    text?: string;
}
export interface IconButtonData {
    clickHandler?: () => void;
    groups: IconWithTextData[];
    leadingText?: string;
    trailingText?: string;
    accessibleName?: string;
    compact?: boolean;
}
export declare class IconButton extends HTMLElement {
    #private;
    static readonly litTagName: import("../../lit-html/static.js").Static;
    set data(data: IconButtonData);
    get data(): IconButtonData;
    connectedCallback(): void;
}
declare global {
    interface HTMLElementTagNameMap {
        'icon-button': IconButton;
    }
}
