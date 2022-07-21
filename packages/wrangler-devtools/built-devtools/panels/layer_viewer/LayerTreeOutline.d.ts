import * as Common from '../../core/common/common.js';
import type * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { LayerView, LayerViewHost, Selection } from './LayerViewHost.js';
declare const LayerTreeOutline_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<EventTypes>;
    addEventListener<T extends Events.PaintProfilerRequested>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<EventTypes, T>;
    once<T_1 extends Events.PaintProfilerRequested>(eventType: T_1): Promise<EventTypes[T_1]>;
    removeEventListener<T_2 extends Events.PaintProfilerRequested>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: Events.PaintProfilerRequested): boolean;
    dispatchEventToListeners<T_3 extends Events.PaintProfilerRequested>(eventType: import("../../core/platform/typescript-utilities.js").NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<EventTypes, T_3>): void;
}) & typeof UI.TreeOutline.TreeOutline;
export declare class LayerTreeOutline extends LayerTreeOutline_base implements Common.EventTarget.EventTarget<EventTypes>, LayerView {
    private layerViewHost;
    private treeOutline;
    private lastHoveredNode;
    element: HTMLElement;
    private layerTree?;
    private layerSnapshotMap?;
    constructor(layerViewHost: LayerViewHost);
    focus(): void;
    selectObject(selection: Selection | null): void;
    hoverObject(selection: Selection | null): void;
    setLayerTree(layerTree: SDK.LayerTreeBase.LayerTreeBase | null): void;
    private update;
    private onMouseMove;
    selectedNodeChanged(node: LayerTreeElement): void;
    private onContextMenu;
    private selectionForNode;
}
export declare const enum Events {
    PaintProfilerRequested = "PaintProfilerRequested"
}
export declare type EventTypes = {
    [Events.PaintProfilerRequested]: Selection;
};
export declare class LayerTreeElement extends UI.TreeOutline.TreeElement {
    treeOutlineInternal: LayerTreeOutline;
    layer: SDK.LayerTreeBase.Layer;
    constructor(tree: LayerTreeOutline, layer: SDK.LayerTreeBase.Layer);
    update(): void;
    onselect(): boolean;
    setHovered(hovered: boolean): void;
}
export declare const layerToTreeElement: WeakMap<SDK.LayerTreeBase.Layer, LayerTreeElement>;
export {};
