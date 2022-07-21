export declare class Fragment {
    private readonly elementInternal;
    private readonly elementsById;
    constructor(element: Element);
    element(): Element;
    $(elementId: string): Element;
    static build(strings: TemplateDefinition, ...values: any[]): Fragment;
    static cached(strings: TemplateDefinition, ...values: any[]): Fragment;
    private static template;
    private static render;
    private static nodeForValue;
}
export declare const textMarker = "{{template-text}}";
export declare const attributeMarker: (index: number) => string;
export declare const html: (strings: TemplateDefinition, ...vararg: any[]) => Element;
export declare type TemplateDefinition = string[] | TemplateStringsArray;
export interface Bind {
    elementId?: string;
    attr?: {
        index: number;
        names: string[];
        values: string[];
    };
    replaceNodeIndex?: number;
}
export interface Template {
    template: HTMLTemplateElement;
    binds: Bind[];
}
