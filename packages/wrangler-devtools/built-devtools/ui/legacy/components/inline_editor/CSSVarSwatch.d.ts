interface SwatchRenderData {
    text: string;
    computedValue: string | null;
    fromFallback: boolean;
    onLinkActivate: (varialeName: string) => void;
}
export declare class CSSVarSwatch extends HTMLElement {
    static readonly litTagName: import("../../../lit-html/static.js").Static;
    private readonly shadow;
    private text;
    private computedValue;
    private fromFallback;
    private onLinkActivate;
    constructor();
    connectedCallback(): void;
    set data(data: SwatchRenderData);
    private parseVariableFunctionParts;
    private get variableName();
    private renderLink;
    private render;
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-css-var-swatch': CSSVarSwatch;
    }
}
export {};
