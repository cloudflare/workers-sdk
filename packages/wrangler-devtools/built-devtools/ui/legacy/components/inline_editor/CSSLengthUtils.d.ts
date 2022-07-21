export declare const enum LengthUnit {
    PIXEL = "px",
    CENTIMETER = "cm",
    MILLIMETER = "mm",
    INCH = "in",
    PICA = "pc",
    POINT = "pt",
    CH = "ch",
    EM = "em",
    REM = "rem",
    VH = "vh",
    VW = "vw",
    VMIN = "vmin",
    VMAX = "vmax"
}
export declare const LENGTH_UNITS: readonly [LengthUnit.PIXEL, LengthUnit.CENTIMETER, LengthUnit.MILLIMETER, LengthUnit.INCH, LengthUnit.PICA, LengthUnit.POINT, LengthUnit.CH, LengthUnit.EM, LengthUnit.REM, LengthUnit.VH, LengthUnit.VW, LengthUnit.VMIN, LengthUnit.VMAX];
export declare const CSSLengthRegex: RegExp;
export interface Length {
    value: number;
    unit: LengthUnit;
}
export declare const parseText: (text: string) => Length | null;
