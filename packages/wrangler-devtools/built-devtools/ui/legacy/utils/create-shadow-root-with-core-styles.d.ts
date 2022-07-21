interface Options {
    cssFile?: CSSStyleSheet[] | {
        cssContent: string;
    };
    delegatesFocus?: boolean;
}
export declare function createShadowRootWithCoreStyles(element: Element, options?: Options): ShadowRoot;
export {};
