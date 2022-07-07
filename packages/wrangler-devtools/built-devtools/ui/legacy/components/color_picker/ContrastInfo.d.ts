import * as Common from '../../../../core/common/common.js';
export declare class ContrastInfo extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    private readonly isNullInternal;
    private contrastRatioInternal;
    private contrastRatioAPCAInternal;
    private contrastRatioThresholds;
    private readonly contrastRationAPCAThreshold;
    private fgColor;
    private bgColorInternal;
    private colorFormatInternal;
    constructor(contrastInfo: ContrastInfoType | null);
    isNull(): boolean;
    setColor(fgColor: Common.Color.Color, colorFormat?: string): void;
    colorFormat(): string | undefined;
    color(): Common.Color.Color | null;
    contrastRatio(): number | null;
    contrastRatioAPCA(): number | null;
    contrastRatioAPCAThreshold(): number | null;
    setBgColor(bgColor: Common.Color.Color): void;
    private setBgColorInternal;
    bgColor(): Common.Color.Color | null;
    private updateContrastRatio;
    contrastRatioThreshold(level: string): number | null;
}
export declare const enum Events {
    ContrastInfoUpdated = "ContrastInfoUpdated"
}
export declare type EventTypes = {
    [Events.ContrastInfoUpdated]: void;
};
export interface ContrastInfoType {
    backgroundColors: string[] | null;
    computedFontSize: string;
    computedFontWeight: string;
}
