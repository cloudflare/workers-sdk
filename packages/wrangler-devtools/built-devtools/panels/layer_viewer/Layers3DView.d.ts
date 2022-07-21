import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import type * as Protocol from '../../generated/protocol.js';
import type * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { LayerView, LayerViewHost } from './LayerViewHost.js';
import { Selection } from './LayerViewHost.js';
declare const Layers3DView_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<EventTypes>;
    addEventListener<T extends keyof EventTypes>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<EventTypes, T>;
    once<T_1 extends keyof EventTypes>(eventType: T_1): Promise<EventTypes[T_1]>;
    removeEventListener<T_2 extends keyof EventTypes>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: keyof EventTypes): boolean;
    dispatchEventToListeners<T_3 extends keyof EventTypes>(eventType: Platform.TypeScriptUtilities.NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<EventTypes, T_3>): void;
}) & typeof UI.Widget.VBox;
export declare class Layers3DView extends Layers3DView_base implements LayerView {
    private readonly failBanner;
    private readonly layerViewHost;
    private transformController;
    private canvasElement;
    private lastSelection;
    private layerTree;
    private readonly textureManager;
    private chromeTextures;
    private rects;
    private snapshotLayers;
    private shaderProgram;
    private oldTextureScale;
    private depthByLayerId;
    private visibleLayers;
    private maxDepth;
    private scale;
    private layerTexture?;
    private projectionMatrix?;
    private whiteTexture?;
    private gl?;
    private dimensionsForAutoscale?;
    private needsUpdate?;
    private panelToolbar?;
    private showSlowScrollRectsSetting?;
    private showPaintsSetting?;
    private mouseDownX?;
    private mouseDownY?;
    constructor(layerViewHost: LayerViewHost);
    setLayerTree(layerTree: SDK.LayerTreeBase.LayerTreeBase | null): void;
    showImageForLayer(layer: SDK.LayerTreeBase.Layer, imageURL?: string): void;
    onResize(): void;
    willHide(): void;
    wasShown(): void;
    updateLayerSnapshot(layer: SDK.LayerTreeBase.Layer): void;
    private setOutline;
    hoverObject(selection: Selection | null): void;
    selectObject(selection: Selection | null): void;
    snapshotForSelection(selection: Selection): Promise<SDK.PaintProfiler.SnapshotWithRect | null>;
    private initGL;
    private createShader;
    private initShaders;
    private resizeCanvas;
    private updateTransformAndConstraints;
    private arrayFromMatrix;
    private initWhiteTexture;
    private initChromeTextures;
    private initGLIfNecessary;
    private calculateDepthsAndVisibility;
    private depthForLayer;
    private calculateScrollRectDepth;
    private updateDimensionsForAutoscale;
    private calculateLayerRect;
    private appendRect;
    private calculateLayerScrollRects;
    private calculateLayerTileRects;
    private calculateRects;
    private makeColorsArray;
    private setVertexAttribute;
    private drawRectangle;
    private drawTexture;
    private drawViewportAndChrome;
    private drawViewRect;
    private update;
    private webglDisabledBanner;
    private selectionFromEventPoint;
    private createVisibilitySetting;
    private initToolbar;
    private onContextMenu;
    private onMouseMove;
    private onMouseDown;
    private onMouseUp;
    private onDoubleClick;
    private updatePaints;
    private showPaints;
}
export declare enum OutlineType {
    Hovered = "hovered",
    Selected = "selected"
}
export declare enum Events {
    PaintProfilerRequested = "PaintProfilerRequested",
    ScaleChanged = "ScaleChanged"
}
export declare type EventTypes = {
    [Events.PaintProfilerRequested]: Selection;
    [Events.ScaleChanged]: number;
};
export declare const enum ChromeTexture {
    Left = 0,
    Middle = 1,
    Right = 2
}
export declare const FragmentShader: string;
export declare const VertexShader: string;
export declare const HoveredBorderColor: number[];
export declare const SelectedBorderColor: number[];
export declare const BorderColor: number[];
export declare const ViewportBorderColor: number[];
export declare const ScrollRectBackgroundColor: number[];
export declare const HoveredImageMaskColor: number[];
export declare const BorderWidth = 1;
export declare const SelectedBorderWidth = 2;
export declare const ViewportBorderWidth = 3;
export declare const LayerSpacing = 20;
export declare const ScrollRectSpacing = 4;
export declare class LayerTextureManager {
    private readonly textureUpdatedCallback;
    private readonly throttler;
    private scale;
    private active;
    private queue;
    private tilesByLayer;
    private gl?;
    constructor(textureUpdatedCallback: () => void);
    static createTextureForImage(gl: WebGLRenderingContext | null, image: HTMLImageElement): WebGLTexture;
    reset(): void;
    setContext(glContext: WebGLRenderingContext): void;
    suspend(): void;
    resume(): void;
    setLayerTree(layerTree: SDK.LayerTreeBase.LayerTreeBase | null): void;
    private setSnapshotsForLayer;
    setScale(scale: number): void;
    tilesForLayer(layer: SDK.LayerTreeBase.Layer): Tile[];
    layerNeedsUpdate(layer: SDK.LayerTreeBase.Layer): void;
    forceUpdate(): void;
    private update;
    private updateLayer;
    private updateTextures;
}
export declare class Rectangle {
    relatedObject: Selection | null;
    lineWidth: number;
    borderColor: number[] | null;
    fillColor: number[] | null;
    texture: WebGLTexture | null;
    vertices: number[];
    constructor(relatedObject: Selection | null);
    setVertices(quad: number[], z: number): void;
    /**
     * Finds coordinates of point on layer quad, having offsets (ratioX * width) and (ratioY * height)
     * from the left corner of the initial layer rect, where width and heigth are layer bounds.
     */
    private calculatePointOnQuad;
    calculateVerticesFromRect(layer: SDK.LayerTreeBase.Layer, rect: Protocol.DOM.Rect, z: number): void;
    /**
     * Intersects quad with given transform matrix and line l(t) = (x0, y0, t)
     */
    intersectWithLine(matrix: DOMMatrix, x0: number, y0: number): number | undefined;
}
export declare class Tile {
    snapshot: SDK.PaintProfiler.PaintProfilerSnapshot;
    rect: Protocol.DOM.Rect;
    scale: number;
    texture: WebGLTexture | null;
    private gl;
    constructor(snapshotWithRect: SDK.PaintProfiler.SnapshotWithRect);
    dispose(): void;
    updateScale(glContext: WebGLRenderingContext, scale: number): Promise<void> | null;
    update(glContext: WebGLRenderingContext, scale: number): Promise<void>;
}
export {};
