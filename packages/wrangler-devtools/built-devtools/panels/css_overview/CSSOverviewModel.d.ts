import * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import type { ContrastIssue } from './CSSOverviewCompletedView.js';
import type { UnusedDeclaration } from './CSSOverviewUnusedDeclarations.js';
interface NodeStyleStats {
    elementCount: number;
    backgroundColors: Map<string, Set<Protocol.DOM.BackendNodeId>>;
    textColors: Map<string, Set<Protocol.DOM.BackendNodeId>>;
    textColorContrastIssues: Map<string, ContrastIssue[]>;
    fillColors: Map<string, Set<Protocol.DOM.BackendNodeId>>;
    borderColors: Map<string, Set<Protocol.DOM.BackendNodeId>>;
    fontInfo: Map<string, Map<string, Map<string, Protocol.DOM.BackendNodeId[]>>>;
    unusedDeclarations: Map<string, UnusedDeclaration[]>;
}
export interface GlobalStyleStats {
    styleRules: number;
    inlineStyles: number;
    externalSheets: number;
    stats: {
        type: number;
        class: number;
        id: number;
        universal: number;
        attribute: number;
        nonSimple: number;
    };
}
export declare class CSSOverviewModel extends SDK.SDKModel.SDKModel<void> {
    #private;
    constructor(target: SDK.Target.Target);
    highlightNode(node: Protocol.DOM.BackendNodeId): void;
    getNodeStyleStats(): Promise<NodeStyleStats>;
    getComputedStyleForNode(nodeId: Protocol.DOM.NodeId): Promise<Protocol.CSS.GetComputedStyleForNodeResponse>;
    getMediaQueries(): Promise<Map<string, Protocol.CSS.CSSMedia[]>>;
    getGlobalStylesheetStats(): Promise<GlobalStyleStats | void>;
}
export {};
