import * as Platform from '../platform/platform.js';
import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import * as Protocol from '../../generated/protocol.js';
import { CSSModel } from './CSSModel.js';
import { OverlayModel } from './OverlayModel.js';
import type { RemoteObject } from './RemoteObject.js';
import { RuntimeModel } from './RuntimeModel.js';
import type { Target } from './Target.js';
import { SDKModel } from './SDKModel.js';
export declare class DOMNode {
    #private;
    ownerDocument: DOMDocument | null;
    id: Protocol.DOM.NodeId;
    index: number | undefined;
    nodeValueInternal: string;
    assignedSlot: DOMNodeShortcut | null;
    readonly shadowRootsInternal: DOMNode[];
    childNodeCountInternal: number;
    childrenInternal: DOMNode[] | null;
    nextSibling: DOMNode | null;
    previousSibling: DOMNode | null;
    firstChild: DOMNode | null;
    lastChild: DOMNode | null;
    parentNode: DOMNode | null;
    templateContentInternal?: DOMNode;
    contentDocumentInternal?: DOMDocument;
    childDocumentPromiseForTesting?: Promise<DOMDocument | null>;
    publicId?: string;
    systemId?: string;
    internalSubset?: string;
    name?: string;
    value?: string;
    constructor(domModel: DOMModel);
    static create(domModel: DOMModel, doc: DOMDocument | null, isInShadowTree: boolean, payload: Protocol.DOM.Node): DOMNode;
    init(doc: DOMDocument | null, isInShadowTree: boolean, payload: Protocol.DOM.Node): void;
    private requestChildDocument;
    isAdFrameNode(): boolean;
    isSVGNode(): boolean;
    creationStackTrace(): Promise<Protocol.Runtime.StackTrace | null>;
    get subtreeMarkerCount(): number;
    domModel(): DOMModel;
    backendNodeId(): Protocol.DOM.BackendNodeId;
    children(): DOMNode[] | null;
    setChildren(children: DOMNode[]): void;
    hasAttributes(): boolean;
    childNodeCount(): number;
    setChildNodeCount(childNodeCount: number): void;
    hasShadowRoots(): boolean;
    shadowRoots(): DOMNode[];
    templateContent(): DOMNode | null;
    contentDocument(): DOMDocument | null;
    setContentDocument(node: DOMDocument): void;
    isIframe(): boolean;
    isPortal(): boolean;
    importedDocument(): DOMNode | null;
    nodeType(): number;
    nodeName(): string;
    pseudoType(): string | undefined;
    pseudoIdentifier(): string | undefined;
    hasPseudoElements(): boolean;
    pseudoElements(): Map<string, DOMNode[]>;
    beforePseudoElement(): DOMNode | undefined;
    afterPseudoElement(): DOMNode | undefined;
    markerPseudoElement(): DOMNode | undefined;
    pageTransitionPseudoElements(): DOMNode[];
    hasAssignedSlot(): boolean;
    isInsertionPoint(): boolean;
    distributedNodes(): DOMNodeShortcut[];
    isInShadowTree(): boolean;
    ancestorShadowHost(): DOMNode | null;
    ancestorShadowRoot(): DOMNode | null;
    ancestorUserAgentShadowRoot(): DOMNode | null;
    isShadowRoot(): boolean;
    shadowRootType(): string | null;
    nodeNameInCorrectCase(): string;
    setNodeName(name: string, callback?: ((arg0: string | null, arg1: DOMNode | null) => void)): void;
    localName(): string;
    nodeValue(): string;
    setNodeValueInternal(nodeValue: string): void;
    setNodeValue(value: string, callback?: ((arg0: string | null) => void)): void;
    getAttribute(name: string): string | undefined;
    setAttribute(name: string, text: string, callback?: ((arg0: string | null) => void)): void;
    setAttributeValue(name: string, value: string, callback?: ((arg0: string | null) => void)): void;
    setAttributeValuePromise(name: string, value: string): Promise<string | null>;
    attributes(): Attribute[];
    removeAttribute(name: string): Promise<void>;
    getChildNodes(callback: (arg0: Array<DOMNode> | null) => void): void;
    getSubtree(depth: number, pierce: boolean): Promise<DOMNode[] | null>;
    getOuterHTML(): Promise<string | null>;
    setOuterHTML(html: string, callback?: ((arg0: string | null) => void)): void;
    removeNode(callback?: ((arg0: string | null, arg1?: Protocol.DOM.NodeId | undefined) => void)): Promise<void>;
    copyNode(): Promise<string | null>;
    path(): string;
    isAncestor(node: DOMNode): boolean;
    isDescendant(descendant: DOMNode): boolean;
    frameOwnerFrameId(): Protocol.Page.FrameId | null;
    frameId(): Protocol.Page.FrameId | null;
    setAttributesPayload(attrs: string[]): boolean;
    insertChild(prev: DOMNode | undefined, payload: Protocol.DOM.Node): DOMNode;
    removeChild(node: DOMNode): void;
    setChildrenPayload(payloads: Protocol.DOM.Node[]): void;
    private setPseudoElements;
    setDistributedNodePayloads(payloads: Protocol.DOM.BackendNode[]): void;
    setAssignedSlot(payload: Protocol.DOM.BackendNode): void;
    private renumber;
    private addAttribute;
    setAttributeInternal(name: string, value: string): void;
    removeAttributeInternal(name: string): void;
    copyTo(targetNode: DOMNode, anchorNode: DOMNode | null, callback?: ((arg0: string | null, arg1: DOMNode | null) => void)): void;
    moveTo(targetNode: DOMNode, anchorNode: DOMNode | null, callback?: ((arg0: string | null, arg1: DOMNode | null) => void)): void;
    isXMLNode(): boolean;
    setMarker(name: string, value: any): void;
    marker<T>(name: string): T | null;
    getMarkerKeysForTest(): string[];
    traverseMarkers(visitor: (arg0: DOMNode, arg1: string) => void): void;
    resolveURL(url: string): Platform.DevToolsPath.UrlString | null;
    highlight(mode?: string): void;
    highlightForTwoSeconds(): void;
    resolveToObject(objectGroup?: string): Promise<RemoteObject | null>;
    boxModel(): Promise<Protocol.DOM.BoxModel | null>;
    setAsInspectedNode(): Promise<void>;
    enclosingElementOrSelf(): DOMNode | null;
    scrollIntoView(): Promise<void>;
    focus(): Promise<void>;
    simpleSelector(): string;
}
export declare namespace DOMNode {
    enum PseudoElementNames {
        Before = "before",
        After = "after",
        Marker = "marker",
        PageTransition = "page-transition",
        PageTransitionContainer = "page-transition-container",
        PageTransitionImageWrapper = "page-transition-image-wrapper",
        PageTransitionOutgoingImage = "page-transition-outgoing-image",
        PageTransitionIncomingImage = "page-transition-incoming-image"
    }
    enum ShadowRootTypes {
        UserAgent = "user-agent",
        Open = "open",
        Closed = "closed"
    }
}
export declare class DeferredDOMNode {
    #private;
    constructor(target: Target, backendNodeId: Protocol.DOM.BackendNodeId);
    resolve(callback: (arg0: DOMNode | null) => void): void;
    resolvePromise(): Promise<DOMNode | null>;
    backendNodeId(): Protocol.DOM.BackendNodeId;
    domModel(): DOMModel;
    highlight(): void;
}
export declare class DOMNodeShortcut {
    nodeType: number;
    nodeName: string;
    deferredNode: DeferredDOMNode;
    constructor(target: Target, backendNodeId: Protocol.DOM.BackendNodeId, nodeType: number, nodeName: string);
}
export declare class DOMDocument extends DOMNode {
    body: DOMNode | null;
    documentElement: DOMNode | null;
    documentURL: Platform.DevToolsPath.UrlString;
    baseURL: Platform.DevToolsPath.UrlString;
    constructor(domModel: DOMModel, payload: Protocol.DOM.Node);
}
export declare class DOMModel extends SDKModel<EventTypes> {
    #private;
    agent: ProtocolProxyApi.DOMApi;
    idToDOMNode: Map<Protocol.DOM.NodeId, DOMNode>;
    readonly runtimeModelInternal: RuntimeModel;
    constructor(target: Target);
    runtimeModel(): RuntimeModel;
    cssModel(): CSSModel;
    overlayModel(): OverlayModel;
    static cancelSearch(): void;
    private scheduleMutationEvent;
    requestDocument(): Promise<DOMDocument | null>;
    getOwnerNodeForFrame(frameId: Protocol.Page.FrameId): Promise<DeferredDOMNode | null>;
    private requestDocumentInternal;
    existingDocument(): DOMDocument | null;
    pushNodeToFrontend(objectId: Protocol.Runtime.RemoteObjectId): Promise<DOMNode | null>;
    pushNodeByPathToFrontend(path: string): Promise<Protocol.DOM.NodeId | null>;
    pushNodesByBackendIdsToFrontend(backendNodeIds: Set<Protocol.DOM.BackendNodeId>): Promise<Map<Protocol.DOM.BackendNodeId, DOMNode | null> | null>;
    attributeModified(nodeId: Protocol.DOM.NodeId, name: string, value: string): void;
    attributeRemoved(nodeId: Protocol.DOM.NodeId, name: string): void;
    inlineStyleInvalidated(nodeIds: number[]): void;
    private loadNodeAttributes;
    characterDataModified(nodeId: Protocol.DOM.NodeId, newValue: string): void;
    nodeForId(nodeId: Protocol.DOM.NodeId | null): DOMNode | null;
    documentUpdated(): void;
    private setDocument;
    private setDetachedRoot;
    setChildNodes(parentId: Protocol.DOM.NodeId, payloads: Protocol.DOM.Node[]): void;
    childNodeCountUpdated(nodeId: Protocol.DOM.NodeId, newValue: number): void;
    childNodeInserted(parentId: Protocol.DOM.NodeId, prevId: Protocol.DOM.NodeId, payload: Protocol.DOM.Node): void;
    childNodeRemoved(parentId: Protocol.DOM.NodeId, nodeId: Protocol.DOM.NodeId): void;
    shadowRootPushed(hostId: Protocol.DOM.NodeId, root: Protocol.DOM.Node): void;
    shadowRootPopped(hostId: Protocol.DOM.NodeId, rootId: Protocol.DOM.NodeId): void;
    pseudoElementAdded(parentId: Protocol.DOM.NodeId, pseudoElement: Protocol.DOM.Node): void;
    topLayerElementsUpdated(): void;
    pseudoElementRemoved(parentId: Protocol.DOM.NodeId, pseudoElementId: Protocol.DOM.NodeId): void;
    distributedNodesUpdated(insertionPointId: Protocol.DOM.NodeId, distributedNodes: Protocol.DOM.BackendNode[]): void;
    private unbind;
    getNodesByStyle(computedStyles: {
        name: string;
        value: string;
    }[], pierce?: boolean): Promise<Protocol.DOM.NodeId[]>;
    performSearch(query: string, includeUserAgentShadowDOM: boolean): Promise<number>;
    searchResult(index: number): Promise<DOMNode | null>;
    private cancelSearch;
    classNamesPromise(nodeId: Protocol.DOM.NodeId): Promise<string[]>;
    querySelector(nodeId: Protocol.DOM.NodeId, selector: string): Promise<Protocol.DOM.NodeId | null>;
    querySelectorAll(nodeId: Protocol.DOM.NodeId, selector: string): Promise<Protocol.DOM.NodeId[] | null>;
    getTopLayerElements(): Promise<Protocol.DOM.NodeId[] | null>;
    markUndoableState(minorChange?: boolean): void;
    nodeForLocation(x: number, y: number, includeUserAgentShadowDOM: boolean): Promise<DOMNode | null>;
    getContainerForNode(nodeId: Protocol.DOM.NodeId, containerName?: string): Promise<DOMNode | null>;
    pushObjectAsNodeToFrontend(object: RemoteObject): Promise<DOMNode | null>;
    suspendModel(): Promise<void>;
    resumeModel(): Promise<void>;
    dispose(): void;
    parentModel(): DOMModel | null;
    getAgent(): ProtocolProxyApi.DOMApi;
    registerNode(node: DOMNode): void;
}
export declare enum Events {
    AttrModified = "AttrModified",
    AttrRemoved = "AttrRemoved",
    CharacterDataModified = "CharacterDataModified",
    DOMMutated = "DOMMutated",
    NodeInserted = "NodeInserted",
    NodeRemoved = "NodeRemoved",
    DocumentUpdated = "DocumentUpdated",
    ChildNodeCountUpdated = "ChildNodeCountUpdated",
    DistributedNodesChanged = "DistributedNodesChanged",
    MarkersChanged = "MarkersChanged",
    TopLayerElementsChanged = "TopLayerElementsChanged"
}
export declare type EventTypes = {
    [Events.AttrModified]: {
        node: DOMNode;
        name: string;
    };
    [Events.AttrRemoved]: {
        node: DOMNode;
        name: string;
    };
    [Events.CharacterDataModified]: DOMNode;
    [Events.DOMMutated]: DOMNode;
    [Events.NodeInserted]: DOMNode;
    [Events.NodeRemoved]: {
        node: DOMNode;
        parent: DOMNode;
    };
    [Events.DocumentUpdated]: DOMModel;
    [Events.ChildNodeCountUpdated]: DOMNode;
    [Events.DistributedNodesChanged]: DOMNode;
    [Events.MarkersChanged]: DOMNode;
    [Events.TopLayerElementsChanged]: void;
};
export declare class DOMModelUndoStack {
    #private;
    constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): DOMModelUndoStack;
    markUndoableState(model: DOMModel, minorChange: boolean): Promise<void>;
    undo(): Promise<void>;
    redo(): Promise<void>;
    dispose(model: DOMModel): void;
}
export interface Attribute {
    name: string;
    value: string;
    _node: DOMNode;
}
