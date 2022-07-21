import * as Common from '../../../../core/common/common.js';
export declare class CSSShadowModel {
    private readonly isBoxShadowInternal;
    private insetInternal;
    private offsetXInternal;
    private offsetYInternal;
    private blurRadiusInternal;
    private spreadRadiusInternal;
    private colorInternal;
    private format;
    private important;
    constructor(isBoxShadow: boolean);
    static parseTextShadow(text: string): CSSShadowModel[];
    static parseBoxShadow(text: string): CSSShadowModel[];
    private static parseShadow;
    setInset(inset: boolean): void;
    setOffsetX(offsetX: CSSLength): void;
    setOffsetY(offsetY: CSSLength): void;
    setBlurRadius(blurRadius: CSSLength): void;
    setSpreadRadius(spreadRadius: CSSLength): void;
    setColor(color: Common.Color.Color): void;
    isBoxShadow(): boolean;
    inset(): boolean;
    offsetX(): CSSLength;
    offsetY(): CSSLength;
    blurRadius(): CSSLength;
    spreadRadius(): CSSLength;
    color(): Common.Color.Color;
    asCSSText(): string;
}
export declare class CSSLength {
    amount: number;
    unit: string;
    constructor(amount: number, unit: string);
    static parse(text: string): CSSLength | null;
    static zero(): CSSLength;
    asCSSText(): string;
    static Regex: RegExp;
}
