import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import * as Protocol from '../../generated/protocol.js';
import type { DOMNode } from './DOMModel.js';
import { DeferredDOMNode, DOMModel } from './DOMModel.js';
import type { RemoteObject } from './RemoteObject.js';
import type { Target } from './Target.js';
import { SDKModel } from './SDKModel.js';
export interface HighlightColor {
    r: number;
    g: number;
    b: number;
    a: number;
}
export interface HighlightRect {
    x: number;
    y: number;
    width: number;
    height: number;
    color: HighlightColor;
    outlineColor: HighlightColor;
}
export interface Hinge {
    width: number;
    height: number;
    x: number;
    y: number;
    contentColor: HighlightColor;
    outlineColor: HighlightColor;
}
export declare class OverlayModel extends SDKModel<EventTypes> implements ProtocolProxyApi.OverlayDispatcher {
    #private;
    overlayAgent: ProtocolProxyApi.OverlayApi;
    constructor(target: Target);
    static highlightObjectAsDOMNode(object: RemoteObject): void;
    static hideDOMNodeHighlight(): void;
    static muteHighlight(): Promise<void[]>;
    static unmuteHighlight(): Promise<void[]>;
    static highlightRect(rect: HighlightRect): void;
    static clearHighlight(): void;
    getDOMModel(): DOMModel;
    highlightRect({ x, y, width, height, color, outlineColor }: HighlightRect): Promise<Protocol.ProtocolResponseWithError>;
    clearHighlight(): Promise<Protocol.ProtocolResponseWithError>;
    private wireAgentToSettings;
    suspendModel(): Promise<void>;
    resumeModel(): Promise<void>;
    setShowViewportSizeOnResize(show: boolean): void;
    private updatePausedInDebuggerMessage;
    setHighlighter(highlighter: Highlighter | null): void;
    setInspectMode(mode: Protocol.Overlay.InspectMode, showDetailedTooltip?: boolean | undefined): Promise<void>;
    inspectModeEnabled(): boolean;
    highlightInOverlay(data: HighlightData, mode?: string, showInfo?: boolean): void;
    highlightInOverlayForTwoSeconds(data: HighlightData): void;
    highlightGridInPersistentOverlay(nodeId: Protocol.DOM.NodeId): void;
    isHighlightedGridInPersistentOverlay(nodeId: Protocol.DOM.NodeId): boolean;
    hideGridInPersistentOverlay(nodeId: Protocol.DOM.NodeId): void;
    highlightScrollSnapInPersistentOverlay(nodeId: Protocol.DOM.NodeId): void;
    isHighlightedScrollSnapInPersistentOverlay(nodeId: Protocol.DOM.NodeId): boolean;
    hideScrollSnapInPersistentOverlay(nodeId: Protocol.DOM.NodeId): void;
    highlightFlexContainerInPersistentOverlay(nodeId: Protocol.DOM.NodeId): void;
    isHighlightedFlexContainerInPersistentOverlay(nodeId: Protocol.DOM.NodeId): boolean;
    hideFlexContainerInPersistentOverlay(nodeId: Protocol.DOM.NodeId): void;
    highlightContainerQueryInPersistentOverlay(nodeId: Protocol.DOM.NodeId): void;
    isHighlightedContainerQueryInPersistentOverlay(nodeId: Protocol.DOM.NodeId): boolean;
    hideContainerQueryInPersistentOverlay(nodeId: Protocol.DOM.NodeId): void;
    highlightSourceOrderInOverlay(node: DOMNode): void;
    colorOfGridInPersistentOverlay(nodeId: Protocol.DOM.NodeId): string | null;
    setColorOfGridInPersistentOverlay(nodeId: Protocol.DOM.NodeId, colorStr: string): void;
    colorOfFlexInPersistentOverlay(nodeId: Protocol.DOM.NodeId): string | null;
    setColorOfFlexInPersistentOverlay(nodeId: Protocol.DOM.NodeId, colorStr: string): void;
    hideSourceOrderInOverlay(): void;
    setSourceOrderActive(isActive: boolean): void;
    sourceOrderModeActive(): boolean;
    highlightIsolatedElementInPersistentOverlay(nodeId: Protocol.DOM.NodeId): void;
    hideIsolatedElementInPersistentOverlay(nodeId: Protocol.DOM.NodeId): void;
    isHighlightedIsolatedElementInPersistentOverlay(nodeId: Protocol.DOM.NodeId): boolean;
    private delayedHideHighlight;
    highlightFrame(frameId: Protocol.Page.FrameId): void;
    showHingeForDualScreen(hinge: Hinge | null): void;
    private buildHighlightConfig;
    nodeHighlightRequested({ nodeId }: Protocol.Overlay.NodeHighlightRequestedEvent): void;
    static setInspectNodeHandler(handler: (arg0: DOMNode) => void): void;
    inspectNodeRequested({ backendNodeId }: Protocol.Overlay.InspectNodeRequestedEvent): void;
    screenshotRequested({ viewport }: Protocol.Overlay.ScreenshotRequestedEvent): void;
    inspectModeCanceled(): void;
    static inspectNodeHandler: ((node: DOMNode) => void) | null;
    getOverlayAgent(): ProtocolProxyApi.OverlayApi;
}
export declare enum Events {
    InspectModeWillBeToggled = "InspectModeWillBeToggled",
    ExitedInspectMode = "InspectModeExited",
    HighlightNodeRequested = "HighlightNodeRequested",
    ScreenshotRequested = "ScreenshotRequested",
    PersistentGridOverlayStateChanged = "PersistentGridOverlayStateChanged",
    PersistentFlexContainerOverlayStateChanged = "PersistentFlexContainerOverlayStateChanged",
    PersistentScrollSnapOverlayStateChanged = "PersistentScrollSnapOverlayStateChanged",
    PersistentContainerQueryOverlayStateChanged = "PersistentContainerQueryOverlayStateChanged"
}
export interface ChangedNodeId {
    nodeId: number;
    enabled: boolean;
}
export declare type EventTypes = {
    [Events.InspectModeWillBeToggled]: OverlayModel;
    [Events.ExitedInspectMode]: void;
    [Events.HighlightNodeRequested]: DOMNode;
    [Events.ScreenshotRequested]: Protocol.Page.Viewport;
    [Events.PersistentGridOverlayStateChanged]: ChangedNodeId;
    [Events.PersistentFlexContainerOverlayStateChanged]: ChangedNodeId;
    [Events.PersistentScrollSnapOverlayStateChanged]: ChangedNodeId;
    [Events.PersistentContainerQueryOverlayStateChanged]: ChangedNodeId;
};
export interface Highlighter {
    highlightInOverlay(data: HighlightData, config: Protocol.Overlay.HighlightConfig): void;
    setInspectMode(mode: Protocol.Overlay.InspectMode, config: Protocol.Overlay.HighlightConfig): Promise<void>;
    highlightFrame(frameId: Protocol.Page.FrameId): void;
}
export declare class SourceOrderHighlighter {
    #private;
    constructor(model: OverlayModel);
    highlightSourceOrderInOverlay(node: DOMNode, sourceOrderConfig: Protocol.Overlay.SourceOrderConfig): void;
    hideSourceOrderHighlight(): void;
}
export interface HighlightNodeData {
    node: DOMNode;
    selectorList?: string;
}
export interface HighlightDeferredNode {
    deferredNode: DeferredDOMNode;
}
export interface HighlightObjectData {
    object: RemoteObject;
    selectorList?: string;
}
export declare type HighlightData = HighlightNodeData | HighlightDeferredNode | HighlightObjectData | {
    clear: boolean;
};
