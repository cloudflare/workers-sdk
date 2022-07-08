import type * as SDK from '../../core/sdk/sdk.js';
import * as TimelineModel from '../../models/timeline_model/timeline_model.js';
import * as UI from '../../ui/legacy/legacy.js';
import type * as Protocol from '../../generated/protocol.js';
export declare class TimelinePaintProfilerView extends UI.SplitWidget.SplitWidget {
    private frameModel;
    private readonly logAndImageSplitWidget;
    private readonly imageView;
    private readonly paintProfilerView;
    private readonly logTreeView;
    private needsUpdateWhenVisible;
    private pendingSnapshot;
    private event;
    private paintProfilerModel;
    private lastLoadedSnapshot;
    constructor(frameModel: TimelineModel.TimelineFrameModel.TimelineFrameModel);
    wasShown(): void;
    setSnapshot(snapshot: SDK.PaintProfiler.PaintProfilerSnapshot): void;
    setEvent(paintProfilerModel: SDK.PaintProfiler.PaintProfilerModel, event: SDK.TracingModel.Event): boolean;
    private updateWhenVisible;
    private update;
    private releaseSnapshot;
    private onWindowChanged;
}
export declare class TimelinePaintImageView extends UI.Widget.Widget {
    private imageContainer;
    private imageElement;
    private readonly maskElement;
    private transformController;
    private maskRectangle?;
    constructor();
    onResize(): void;
    private updateImagePosition;
    showImage(imageURL?: string): void;
    setMask(maskRectangle: Protocol.DOM.Rect | null): void;
    wasShown(): void;
}
