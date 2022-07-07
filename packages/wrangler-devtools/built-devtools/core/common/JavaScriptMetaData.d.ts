export interface DOMPinnedWebIDLProp {
    global?: boolean;
    specs?: number;
    rules?: Array<DOMPinnedWebIDLRule>;
}
export interface DOMPinnedWebIDLType {
    inheritance?: string;
    includes?: Array<string>;
    props?: {
        [PropName: string]: DOMPinnedWebIDLProp;
    };
    rules?: Array<DOMPinnedWebIDLRule>;
}
export interface DOMPinnedWebIDLRule {
    when: string;
    is: string;
}
export interface JavaScriptMetaData {
    signaturesForNativeFunction(name: string): string[][] | null;
    signaturesForInstanceMethod(name: string, receiverClassName: string): string[][] | null;
    signaturesForStaticMethod(name: string, receiverConstructorName: string): string[][] | null;
}
