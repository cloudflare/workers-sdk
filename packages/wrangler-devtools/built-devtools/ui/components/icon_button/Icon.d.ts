export interface IconWithPath {
    iconPath: string;
    color: string;
    width?: string;
    height?: string;
}
export interface IconWithName {
    iconName: string;
    color: string;
    width?: string;
    height?: string;
}
export declare type IconData = IconWithPath | IconWithName;
export declare class Icon extends HTMLElement {
    #private;
    static readonly litTagName: import("../../lit-html/static.js").Static;
    connectedCallback(): void;
    set data(data: IconData);
    get data(): IconData;
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-icon': Icon;
    }
}
