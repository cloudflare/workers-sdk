import { ColorSwatch } from './ColorSwatch.js';
import type { CSSShadowModel } from './CSSShadowModel.js';
export declare class BezierSwatch extends HTMLSpanElement {
    private readonly iconElementInternal;
    private textElement;
    constructor();
    static create(): BezierSwatch;
    bezierText(): string;
    setBezierText(text: string): void;
    hideText(hide: boolean): void;
    iconElement(): HTMLSpanElement;
    private static constructorInternal;
}
export declare class CSSShadowSwatch extends HTMLSpanElement {
    private readonly iconElementInternal;
    private contentElement;
    private colorSwatchInternal;
    private modelInternal?;
    constructor();
    static create(): CSSShadowSwatch;
    model(): CSSShadowModel;
    setCSSShadow(model: CSSShadowModel): void;
    hideText(hide: boolean): void;
    iconElement(): HTMLSpanElement;
    colorSwatch(): ColorSwatch | null;
    private static constructorInternal;
}
