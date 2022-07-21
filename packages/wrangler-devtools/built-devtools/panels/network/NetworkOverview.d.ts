import * as SDK from '../../core/sdk/sdk.js';
import * as PerfUI from '../../ui/legacy/components/perf_ui/perf_ui.js';
export declare class NetworkOverview extends PerfUI.TimelineOverviewPane.TimelineOverviewBase {
    private selectedFilmStripTime;
    private numBands;
    private updateScheduled;
    private highlightedRequest;
    private loadEvents;
    private domContentLoadedEvents;
    private nextBand;
    private bandMap;
    private requestsList;
    private requestsSet;
    private span;
    private filmStripModel?;
    private lastBoundary?;
    constructor();
    setHighlightedRequest(request: SDK.NetworkRequest.NetworkRequest | null): void;
    setFilmStripModel(filmStripModel: SDK.FilmStripModel.FilmStripModel | null): void;
    selectFilmStripFrame(time: number): void;
    clearFilmStripFrame(): void;
    private loadEventFired;
    private domContentLoadedEventFired;
    private bandId;
    updateRequest(request: SDK.NetworkRequest.NetworkRequest): void;
    wasShown(): void;
    calculator(): PerfUI.TimelineOverviewPane.TimelineOverviewCalculator;
    onResize(): void;
    reset(): void;
    scheduleUpdate(): void;
    update(): void;
}
export declare const RequestTimeRangeNameToColor: {
    [key: string]: string;
};
export declare const _bandHeight: number;
export declare const _padding: number;
