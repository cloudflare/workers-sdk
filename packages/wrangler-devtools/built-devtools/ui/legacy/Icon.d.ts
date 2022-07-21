export declare class Icon extends HTMLSpanElement {
    private descriptor;
    private spriteSheet;
    private iconType;
    constructor();
    static create(iconType?: string, className?: string): Icon;
    setIconType(iconType: string): void;
    private toggleClasses;
    private propertyValue;
}
export interface Descriptor {
    position: string;
    spritesheet: string;
    isMask?: boolean;
    coordinates?: {
        x: number;
        y: number;
    };
    invert?: boolean;
}
export interface SpriteSheet {
    cellWidth: number;
    cellHeight: number;
    padding: number;
}
