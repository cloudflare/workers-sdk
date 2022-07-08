import * as SDK from '../../core/sdk/sdk.js';
import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import type * as Protocol from '../../generated/protocol.js';
export declare class LayerTreeModel extends SDK.SDKModel.SDKModel<EventTypes> {
    readonly layerTreeAgent: ProtocolProxyApi.LayerTreeApi;
    readonly paintProfilerModel: SDK.PaintProfiler.PaintProfilerModel;
    private layerTreeInternal;
    private readonly throttler;
    private enabled?;
    private lastPaintRectByLayerId?;
    constructor(target: SDK.Target.Target);
    disable(): Promise<void>;
    enable(): void;
    private forceEnable;
    layerTree(): SDK.LayerTreeBase.LayerTreeBase | null;
    layerTreeChanged(layers: Protocol.LayerTree.Layer[] | null): Promise<void>;
    private innerSetLayers;
    layerPainted(layerId: string, clipRect: Protocol.DOM.Rect): void;
    private onMainFrameNavigated;
}
export declare enum Events {
    LayerTreeChanged = "LayerTreeChanged",
    LayerPainted = "LayerPainted"
}
export declare type EventTypes = {
    [Events.LayerTreeChanged]: void;
    [Events.LayerPainted]: AgentLayer;
};
export declare class AgentLayerTree extends SDK.LayerTreeBase.LayerTreeBase {
    private layerTreeModel;
    constructor(layerTreeModel: LayerTreeModel);
    setLayers(payload: Protocol.LayerTree.Layer[] | null): Promise<void>;
    private innerSetLayers;
}
export declare class AgentLayer implements SDK.LayerTreeBase.Layer {
    private scrollRectsInternal;
    private quadInternal;
    private childrenInternal;
    private image;
    private parentInternal;
    private layerPayload;
    private layerTreeModel;
    private nodeInternal?;
    lastPaintRectInternal?: Protocol.DOM.Rect;
    private paintCountInternal?;
    private stickyPositionConstraintInternal?;
    constructor(layerTreeModel: LayerTreeModel, layerPayload: Protocol.LayerTree.Layer);
    id(): Protocol.LayerTree.LayerId;
    parentId(): Protocol.LayerTree.LayerId | null;
    parent(): SDK.LayerTreeBase.Layer | null;
    isRoot(): boolean;
    children(): SDK.LayerTreeBase.Layer[];
    addChild(childParam: SDK.LayerTreeBase.Layer): void;
    setNode(node: SDK.DOMModel.DOMNode | null): void;
    node(): SDK.DOMModel.DOMNode | null;
    nodeForSelfOrAncestor(): SDK.DOMModel.DOMNode | null;
    offsetX(): number;
    offsetY(): number;
    width(): number;
    height(): number;
    transform(): number[] | null;
    quad(): number[];
    anchorPoint(): number[];
    invisible(): boolean;
    paintCount(): number;
    lastPaintRect(): Protocol.DOM.Rect | null;
    setLastPaintRect(lastPaintRect?: Protocol.DOM.Rect): void;
    scrollRects(): Protocol.LayerTree.ScrollRect[];
    stickyPositionConstraint(): SDK.LayerTreeBase.StickyPositionConstraint | null;
    requestCompositingReasonIds(): Promise<string[]>;
    drawsContent(): boolean;
    gpuMemoryUsage(): number;
    snapshots(): Promise<SDK.PaintProfiler.SnapshotWithRect | null>[];
    didPaint(rect: Protocol.DOM.Rect): void;
    reset(layerPayload: Protocol.LayerTree.Layer): void;
    private matrixFromArray;
    private calculateTransformToViewport;
    private createVertexArrayForRect;
    calculateQuad(parentTransform: DOMMatrix): void;
}
