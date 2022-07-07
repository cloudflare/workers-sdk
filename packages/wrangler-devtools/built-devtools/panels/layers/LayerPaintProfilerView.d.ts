import type * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class LayerPaintProfilerView extends UI.SplitWidget.SplitWidget {
    private readonly logTreeView;
    private readonly paintProfilerView;
    constructor(showImageCallback: (arg0?: string | undefined) => void);
    reset(): void;
    profile(snapshot: SDK.PaintProfiler.PaintProfilerSnapshot): void;
    setScale(scale: number): void;
    private onWindowChanged;
}
