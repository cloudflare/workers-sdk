import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class PerformanceMonitorImpl extends UI.Widget.HBox implements SDK.TargetManager.SDKModelObserver<SDK.PerformanceMetricsModel.PerformanceMetricsModel> {
    private metricsBuffer;
    private readonly pixelsPerMs;
    private pollIntervalMs;
    private readonly scaleHeight;
    private graphHeight;
    private gridColor;
    private controlPane;
    private canvas;
    private animationId;
    private width;
    private height;
    private model?;
    private startTimestamp?;
    private pollTimer?;
    constructor();
    static instance(opts?: {
        forceNew: null;
    }): PerformanceMonitorImpl;
    wasShown(): void;
    willHide(): void;
    modelAdded(model: SDK.PerformanceMetricsModel.PerformanceMetricsModel): void;
    modelRemoved(model: SDK.PerformanceMetricsModel.PerformanceMetricsModel): void;
    private suspendStateChanged;
    private startPolling;
    private stopPolling;
    private poll;
    private draw;
    private drawHorizontalGrid;
    private drawChart;
    private calcMax;
    private drawVerticalGrid;
    private buildMetricPath;
    onResize(): void;
    private recalcChartHeight;
}
export declare const enum Format {
    Percent = "Percent",
    Bytes = "Bytes"
}
export declare class ControlPane extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    element: Element;
    private readonly enabledChartsSetting;
    private readonly enabledCharts;
    private chartsInfo;
    private indicators;
    constructor(parent: Element);
    instantiateMetricData(): void;
    private onToggle;
    charts(): ChartInfo[];
    isActive(metricName: string): boolean;
    updateMetrics(metrics: Map<string, number>): void;
}
declare const enum Events {
    MetricChanged = "MetricChanged"
}
declare type EventTypes = {
    [Events.MetricChanged]: void;
};
export declare class MetricIndicator {
    private info;
    private active;
    private readonly onToggle;
    element: HTMLElement;
    private readonly swatchElement;
    private valueElement;
    constructor(parent: Element, info: ChartInfo, active: boolean, onToggle: (arg0: boolean) => void);
    static formatNumber(value: number, info: ChartInfo): string;
    setValue(value: number): void;
    private toggleIndicator;
    private handleKeypress;
}
export declare const format: Intl.NumberFormat;
export interface MetricInfo {
    name: string;
    color: string;
}
export interface ChartInfo {
    title: string;
    metrics: {
        name: string;
        color: string;
    }[];
    max?: number;
    currentMax?: number;
    format?: Format;
    smooth?: boolean;
    color?: string;
    stacked?: boolean;
}
export {};
