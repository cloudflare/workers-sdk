import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { LayerView, LayerViewHost, Selection } from './LayerViewHost.js';
declare const LayerDetailsView_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<EventTypes>;
    addEventListener<T extends Events.PaintProfilerRequested>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<EventTypes, T>;
    once<T_1 extends Events.PaintProfilerRequested>(eventType: T_1): Promise<EventTypes[T_1]>;
    removeEventListener<T_2 extends Events.PaintProfilerRequested>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: Events.PaintProfilerRequested): boolean;
    dispatchEventToListeners<T_3 extends Events.PaintProfilerRequested>(eventType: Platform.TypeScriptUtilities.NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<EventTypes, T_3>): void;
}) & typeof UI.Widget.Widget;
export declare class LayerDetailsView extends LayerDetailsView_base implements LayerView {
    private readonly layerViewHost;
    private readonly emptyWidget;
    private layerSnapshotMap;
    private tableElement;
    private tbodyElement;
    private sizeCell;
    private compositingReasonsCell;
    private memoryEstimateCell;
    private paintCountCell;
    private scrollRectsCell;
    private stickyPositionConstraintCell;
    private paintProfilerLink;
    private selection;
    constructor(layerViewHost: LayerViewHost);
    hoverObject(_selection: Selection | null): void;
    selectObject(selection: Selection | null): void;
    setLayerTree(_layerTree: SDK.LayerTreeBase.LayerTreeBase | null): void;
    wasShown(): void;
    private onScrollRectClicked;
    private invokeProfilerLink;
    private createScrollRectElement;
    private formatStickyAncestorLayer;
    private createStickyAncestorChild;
    private populateStickyPositionConstraintCell;
    update(): void;
    private buildContent;
    private createRow;
    private updateCompositingReasons;
    static getCompositingReasons(compositingReasonIds: string[]): string[];
}
export declare enum Events {
    PaintProfilerRequested = "PaintProfilerRequested"
}
export declare type EventTypes = {
    [Events.PaintProfilerRequested]: Selection;
};
export declare const slowScrollRectNames: Map<SDK.LayerTreeBase.Layer.ScrollRectType, () => Common.UIString.LocalizedString>;
export {};
