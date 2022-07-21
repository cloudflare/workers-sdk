import type * as Elements from '../../../../panels/elements/components/components.js';
interface CrumbOverrides extends Partial<Elements.Helper.DOMNode> {
    attributes?: {
        [x: string]: string | undefined;
    };
}
export declare const makeCrumb: (overrides?: CrumbOverrides) => Elements.Helper.DOMNode;
export {};
