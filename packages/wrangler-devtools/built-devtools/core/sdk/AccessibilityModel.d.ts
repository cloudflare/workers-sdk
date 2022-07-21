import type * as Protocol from '../../generated/protocol.js';
import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import type { DOMNode } from './DOMModel.js';
import { DeferredDOMNode } from './DOMModel.js';
import type { Target } from './Target.js';
import { SDKModel } from './SDKModel.js';
export declare enum CoreAxPropertyName {
    Name = "name",
    Description = "description",
    Value = "value",
    Role = "role"
}
export interface CoreOrProtocolAxProperty {
    name: CoreAxPropertyName | Protocol.Accessibility.AXPropertyName;
    value: Protocol.Accessibility.AXValue;
}
export declare class AccessibilityNode {
    #private;
    constructor(accessibilityModel: AccessibilityModel, payload: Protocol.Accessibility.AXNode);
    id(): Protocol.Accessibility.AXNodeId;
    accessibilityModel(): AccessibilityModel;
    ignored(): boolean;
    ignoredReasons(): Protocol.Accessibility.AXProperty[] | null;
    role(): Protocol.Accessibility.AXValue | null;
    coreProperties(): CoreOrProtocolAxProperty[];
    name(): Protocol.Accessibility.AXValue | null;
    description(): Protocol.Accessibility.AXValue | null;
    value(): Protocol.Accessibility.AXValue | null;
    properties(): Protocol.Accessibility.AXProperty[] | null;
    parentNode(): AccessibilityNode | null;
    isDOMNode(): boolean;
    backendDOMNodeId(): Protocol.DOM.BackendNodeId | null;
    deferredDOMNode(): DeferredDOMNode | null;
    highlightDOMNode(): void;
    children(): AccessibilityNode[];
    numChildren(): number;
    hasOnlyUnloadedChildren(): boolean;
    hasUnloadedChildren(): boolean;
    getFrameId(): Protocol.Page.FrameId | null;
}
export declare enum Events {
    TreeUpdated = "TreeUpdated"
}
export declare type EventTypes = {
    [Events.TreeUpdated]: {
        root?: AccessibilityNode;
    };
};
export declare class AccessibilityModel extends SDKModel<EventTypes> implements ProtocolProxyApi.AccessibilityDispatcher {
    #private;
    agent: ProtocolProxyApi.AccessibilityApi;
    constructor(target: Target);
    clear(): void;
    resumeModel(): Promise<void>;
    suspendModel(): Promise<void>;
    requestPartialAXTree(node: DOMNode): Promise<void>;
    loadComplete({ root }: Protocol.Accessibility.LoadCompleteEvent): void;
    nodesUpdated({ nodes }: Protocol.Accessibility.NodesUpdatedEvent): void;
    private createNodesFromPayload;
    requestRootNode(frameId?: Protocol.Page.FrameId): Promise<AccessibilityNode | undefined>;
    requestAXChildren(nodeId: Protocol.Accessibility.AXNodeId, frameId?: Protocol.Page.FrameId): Promise<AccessibilityNode[]>;
    requestAndLoadSubTreeToNode(node: DOMNode): Promise<AccessibilityNode[] | null>;
    axNodeForId(axId: Protocol.Accessibility.AXNodeId): AccessibilityNode | null;
    setRootAXNodeForFrameId(frameId: Protocol.Page.FrameId, axNode: AccessibilityNode): void;
    axNodeForFrameId(frameId: Protocol.Page.FrameId): AccessibilityNode | null;
    setAXNodeForAXId(axId: string, axNode: AccessibilityNode): void;
    axNodeForDOMNode(domNode: DOMNode | null): AccessibilityNode | null;
    setAXNodeForBackendDOMNodeId(backendDOMNodeId: Protocol.DOM.BackendNodeId, axNode: AccessibilityNode): void;
    getAgent(): ProtocolProxyApi.AccessibilityApi;
}
