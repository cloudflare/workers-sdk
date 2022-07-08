import type { ContrastInfo } from './ContrastInfo.js';
export declare class ContrastOverlay {
    private contrastInfo;
    private visible;
    private readonly contrastRatioSVG;
    private readonly contrastRatioLines;
    private width;
    private height;
    private readonly contrastRatioLineBuilder;
    private readonly contrastRatioLinesThrottler;
    private readonly drawContrastRatioLinesBound;
    constructor(contrastInfo: ContrastInfo, colorElement: Element);
    private update;
    setDimensions(width: number, height: number): void;
    setVisible(visible: boolean): void;
    private drawContrastRatioLines;
}
export declare class ContrastRatioLineBuilder {
    private readonly contrastInfo;
    constructor(contrastInfo: ContrastInfo);
    drawContrastRatioLine(width: number, height: number, level: string): string | null;
}
