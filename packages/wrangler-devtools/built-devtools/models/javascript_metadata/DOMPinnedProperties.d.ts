/**
 * All the specs used when generating the DOM pinned properties dataset.
 */
export declare const SPECS: {
    html: number;
    dom: number;
    uievents: number;
    pointerevents: number;
    cssom: number;
    'wai-aria': number;
};
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
export interface DOMPinnedPropertiesDataset {
    [TypeName: string]: DOMPinnedWebIDLType;
}
/**
 * The DOM pinned properties dataset. Generated from WebIDL data parsed from
 * the SPECS above.
 *
 * This is an object with WebIDL type names as keys and their WebIDL properties
 * and inheritance/include chains as values.
 */
export declare const DOMPinnedProperties: DOMPinnedPropertiesDataset;
