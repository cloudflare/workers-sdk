import * as SDK from '../../core/sdk/sdk.js';
export declare const fullQualifiedSelector: (node: SDK.DOMModel.DOMNode, justSelector?: boolean | undefined) => string;
export declare const cssPath: (node: SDK.DOMModel.DOMNode, optimized?: boolean | undefined) => string;
export declare const canGetJSPath: (node: SDK.DOMModel.DOMNode) => boolean;
export declare const jsPath: (node: SDK.DOMModel.DOMNode, optimized?: boolean | undefined) => string;
export declare const xPath: (node: SDK.DOMModel.DOMNode, optimized?: boolean | undefined) => string;
export declare class Step {
    value: string;
    optimized: boolean;
    constructor(value: string, optimized: boolean);
    toString(): string;
}
