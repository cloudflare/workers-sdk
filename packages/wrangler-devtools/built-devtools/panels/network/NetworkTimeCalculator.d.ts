import * as Common from '../../core/common/common.js';
import type * as SDK from '../../core/sdk/sdk.js';
import type * as PerfUI from '../../ui/legacy/components/perf_ui/perf_ui.js';
export interface Label {
    left: string;
    right: string;
    tooltip?: string;
}
export declare class NetworkTimeBoundary {
    minimum: number;
    maximum: number;
    constructor(minimum: number, maximum: number);
    equals(other: NetworkTimeBoundary): boolean;
}
export declare class NetworkTimeCalculator extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements PerfUI.TimelineGrid.Calculator {
    startAtZero: boolean;
    private minimumBoundaryInternal;
    private maximumBoundaryInternal;
    private readonly boundryChangedEventThrottler;
    private window;
    private workingArea?;
    constructor(startAtZero: boolean);
    setWindow(window: NetworkTimeBoundary | null): void;
    setInitialUserFriendlyBoundaries(): void;
    computePosition(time: number): number;
    formatValue(value: number, precision?: number): string;
    minimumBoundary(): number;
    zeroTime(): number;
    maximumBoundary(): number;
    boundary(): NetworkTimeBoundary;
    boundarySpan(): number;
    reset(): void;
    value(): number;
    setDisplayWidth(clientWidth: number): void;
    computeBarGraphPercentages(request: SDK.NetworkRequest.NetworkRequest): {
        start: number;
        middle: number;
        end: number;
    };
    computePercentageFromEventTime(eventTime: number): number;
    percentageToTime(percentage: number): number;
    boundaryChanged(): void;
    updateBoundariesForEventTime(eventTime: number): void;
    computeBarGraphLabels(request: SDK.NetworkRequest.NetworkRequest): Label;
    updateBoundaries(request: SDK.NetworkRequest.NetworkRequest): void;
    extendBoundariesToIncludeTimestamp(timestamp: number): boolean;
    lowerBound(_request: SDK.NetworkRequest.NetworkRequest): number;
    upperBound(_request: SDK.NetworkRequest.NetworkRequest): number;
}
export declare const _minimumSpread = 0.1;
export declare enum Events {
    BoundariesChanged = "BoundariesChanged"
}
export declare type EventTypes = {
    [Events.BoundariesChanged]: void;
};
export declare class NetworkTransferTimeCalculator extends NetworkTimeCalculator {
    constructor();
    formatValue(value: number, precision?: number): string;
    lowerBound(request: SDK.NetworkRequest.NetworkRequest): number;
    upperBound(request: SDK.NetworkRequest.NetworkRequest): number;
}
export declare class NetworkTransferDurationCalculator extends NetworkTimeCalculator {
    constructor();
    formatValue(value: number, precision?: number): string;
    upperBound(request: SDK.NetworkRequest.NetworkRequest): number;
}
