import type * as SDK from '../../core/sdk/sdk.js';
import type * as TimelineModel from '../../models/timeline_model/timeline_model.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class TimelineLayersView extends UI.SplitWidget.SplitWidget {
    private readonly model;
    private readonly showPaintProfilerCallback;
    private readonly rightSplitWidget;
    private readonly layerViewHost;
    private readonly layers3DView;
    private frameLayerTree?;
    private updateWhenVisible?;
    constructor(model: TimelineModel.TimelineModel.TimelineModelImpl, showPaintProfilerCallback: (arg0: SDK.PaintProfiler.PaintProfilerSnapshot) => void);
    showLayerTree(frameLayerTree: TimelineModel.TimelineFrameModel.TracingFrameLayerTree): void;
    wasShown(): void;
    private onPaintProfilerRequested;
    private update;
}
