import * as Common from '../../../core/common/common.js';
export declare class ThemeSupport extends EventTarget {
    private setting;
    private themeNameInternal;
    private customSheets;
    private computedRoot;
    private constructor();
    static hasInstance(): boolean;
    static instance(opts?: {
        forceNew: boolean | null;
        setting: Common.Settings.Setting<string> | null;
    }): ThemeSupport;
    getComputedValue(variableName: string, target?: Element | null): string;
    hasTheme(): boolean;
    themeName(): string;
    injectHighlightStyleSheets(element: Element | ShadowRoot): void;
    appendStyle(node: Node, { cssContent }: {
        cssContent: string;
    }): void;
    injectCustomStyleSheets(element: Element | ShadowRoot): void;
    addCustomStylesheet(sheetText: string): void;
    applyTheme(document: Document): void;
}
export declare class ThemeChangeEvent extends Event {
    static readonly eventName = "themechange";
    constructor();
}
