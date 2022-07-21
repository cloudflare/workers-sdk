import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as PerfUI from '../../ui/legacy/components/perf_ui/perf_ui.js';
import * as UI from '../../ui/legacy/legacy.js';
declare const HeapTimelineOverview_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<EventTypes>;
    addEventListener<T extends Events.IdsRangeChanged>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<EventTypes, T>;
    once<T_1 extends Events.IdsRangeChanged>(eventType: T_1): Promise<EventTypes[T_1]>;
    removeEventListener<T_2 extends Events.IdsRangeChanged>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: Events.IdsRangeChanged): boolean;
    dispatchEventToListeners<T_3 extends Events.IdsRangeChanged>(eventType: Platform.TypeScriptUtilities.NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<EventTypes, T_3>): void;
}) & typeof UI.Widget.VBox;
export declare class HeapTimelineOverview extends HeapTimelineOverview_base {
    readonly overviewCalculator: OverviewCalculator;
    overviewContainer: HTMLElement;
    overviewGrid: PerfUI.OverviewGrid.OverviewGrid;
    overviewCanvas: HTMLCanvasElement;
    windowLeft: number;
    windowRight: number;
    readonly yScale: SmoothScale;
    readonly xScale: SmoothScale;
    profileSamples: Samples;
    running?: boolean;
    updateOverviewCanvas?: boolean;
    updateGridTimerId?: number;
    updateTimerId?: number | null;
    windowWidth?: number;
    constructor();
    start(): void;
    stop(): void;
    setSamples(samples: Samples): void;
    drawOverviewCanvas(width: number, height: number): void;
    onResize(): void;
    onWindowChanged(): void;
    scheduleUpdate(): void;
    updateBoundaries(): void;
    update(): void;
    updateGrid(): void;
}
export declare const enum Events {
    IdsRangeChanged = "IdsRangeChanged"
}
export interface IdsRangeChangedEvent {
    minId: number;
    maxId: number;
    size: number;
}
export declare type EventTypes = {
    [Events.IdsRangeChanged]: IdsRangeChangedEvent;
};
export declare class SmoothScale {
    lastUpdate: number;
    currentScale: number;
    constructor();
    nextScale(target: number): number;
}
export declare class Samples {
    sizes: number[];
    ids: number[];
    timestamps: number[];
    max: number[];
    totalTime: number;
    constructor();
}
export declare class OverviewCalculator implements PerfUI.TimelineGrid.Calculator {
    maximumBoundaries: number;
    minimumBoundaries: number;
    xScaleFactor: number;
    constructor();
    updateBoundaries(chart: HeapTimelineOverview): void;
    computePosition(time: number): number;
    formatValue(value: number, precision?: number): string;
    maximumBoundary(): number;
    minimumBoundary(): number;
    zeroTime(): number;
    boundarySpan(): number;
}
export {};
