import * as SDK from '../../../core/sdk/sdk.js';
export interface DOMNode {
    parentNode: DOMNode | null;
    id: number;
    nodeType: number;
    pseudoType?: string;
    shadowRootType: string | null;
    nodeName: string;
    nodeNameNicelyCased: string;
    legacyDomNode: SDK.DOMModel.DOMNode;
    highlightNode: (mode?: string) => void;
    clearHighlight: () => void;
    getAttribute: (attr: string) => string | undefined;
}
export declare const legacyNodeToElementsComponentsNode: (node: SDK.DOMModel.DOMNode) => DOMNode;
