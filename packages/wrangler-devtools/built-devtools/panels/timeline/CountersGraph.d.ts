import * as TimelineModel from '../../models/timeline_model/timeline_model.js';
import * as PerfUI from '../../ui/legacy/components/perf_ui/perf_ui.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { PerformanceModel } from './PerformanceModel.js';
import type { TimelineModeViewDelegate } from './TimelinePanel.js';
export declare class CountersGraph extends UI.Widget.VBox {
    private readonly delegate;
    private readonly calculator;
    private model;
    private readonly header;
    readonly toolbar: UI.Toolbar.Toolbar;
    private graphsContainer;
    canvasContainer: UI.Widget.WidgetElement;
    private canvas;
    private readonly timelineGrid;
    private readonly counters;
    private readonly counterUI;
    private readonly countersByName;
    private readonly gpuMemoryCounter;
    private track?;
    currentValuesBar?: HTMLElement;
    private markerXPosition?;
    constructor(delegate: TimelineModeViewDelegate);
    setModel(model: PerformanceModel | null, track: TimelineModel.TimelineModel.Track | null): void;
    private createCurrentValuesBar;
    private createCounter;
    resizerElement(): Element | null;
    private resize;
    private onWindowChanged;
    scheduleRefresh(): void;
    draw(): void;
    private onClick;
    private onMouseLeave;
    private clearCurrentValueAndMarker;
    private onMouseMove;
    private refreshCurrentValues;
    refresh(): void;
    private clear;
}
export declare class Counter {
    times: number[];
    values: number[];
    x: number[];
    minimumIndex: number;
    maximumIndex: number;
    private maxTime;
    private minTime;
    limitValue?: number;
    constructor();
    appendSample(time: number, value: number): void;
    reset(): void;
    setLimit(value: number): void;
    calculateBounds(): {
        min: number;
        max: number;
    };
    calculateVisibleIndexes(calculator: Calculator): void;
    calculateXValues(width: number): void;
}
export declare class CounterUI {
    private readonly countersPane;
    counter: Counter;
    private readonly formatter;
    private readonly setting;
    private filter;
    private range;
    private value;
    graphColor: string;
    limitColor: string | null | undefined;
    graphYValues: number[];
    private readonly verticalPadding;
    private currentValueLabel;
    private marker;
    constructor(countersPane: CountersGraph, title: string, graphColor: string, counter: Counter, formatter?: (arg0: number) => string);
    reset(): void;
    setRange(minValue: number, maxValue: number): void;
    private toggleCounterGraph;
    recordIndexAt(x: number): number;
    updateCurrentValue(x: number): void;
    clearCurrentValueAndMarker(): void;
    drawGraph(canvas: HTMLCanvasElement): void;
    visible(): boolean;
}
export declare class Calculator implements PerfUI.TimelineGrid.Calculator {
    private minimumBoundaryInternal;
    private maximumBoundaryInternal;
    private workingArea;
    private zeroTimeInternal;
    constructor();
    setZeroTime(time: number): void;
    computePosition(time: number): number;
    setWindow(minimumBoundary: number, maximumBoundary: number): void;
    setDisplayWidth(clientWidth: number): void;
    formatValue(value: number, precision?: number): string;
    maximumBoundary(): number;
    minimumBoundary(): number;
    zeroTime(): number;
    boundarySpan(): number;
}
