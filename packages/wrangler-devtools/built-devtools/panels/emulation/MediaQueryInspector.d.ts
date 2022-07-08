import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class MediaQueryInspector extends UI.Widget.Widget implements SDK.TargetManager.SDKModelObserver<SDK.CSSModel.CSSModel> {
    private readonly mediaThrottler;
    private readonly getWidthCallback;
    private readonly setWidthCallback;
    private scale;
    elementsToMediaQueryModel: WeakMap<Element, MediaQueryUIModel>;
    elementsToCSSLocations: WeakMap<Element, SDK.CSSModel.CSSLocation[]>;
    private cssModel?;
    private cachedQueryModels?;
    constructor(getWidthCallback: () => number, setWidthCallback: (arg0: number) => void);
    modelAdded(cssModel: SDK.CSSModel.CSSModel): void;
    modelRemoved(cssModel: SDK.CSSModel.CSSModel): void;
    setAxisTransform(scale: number): void;
    private onMediaQueryClicked;
    private onContextMenu;
    private revealSourceLocation;
    private scheduleMediaQueriesUpdate;
    private refetchMediaQueries;
    private squashAdjacentEqual;
    private rebuildMediaQueries;
    private renderMediaQueries;
    private zoomFactor;
    wasShown(): void;
    private createElementFromMediaQueryModel;
}
export declare const enum Section {
    Max = 0,
    MinMax = 1,
    Min = 2
}
export declare class MediaQueryUIModel {
    private cssMedia;
    private readonly minWidthExpressionInternal;
    private readonly maxWidthExpressionInternal;
    private readonly activeInternal;
    private readonly sectionInternal;
    private rawLocationInternal?;
    constructor(cssMedia: SDK.CSSMedia.CSSMedia, minWidthExpression: SDK.CSSMedia.CSSMediaQueryExpression | null, maxWidthExpression: SDK.CSSMedia.CSSMediaQueryExpression | null, active: boolean);
    static createFromMediaQuery(cssMedia: SDK.CSSMedia.CSSMedia, mediaQuery: SDK.CSSMedia.CSSMediaQuery): MediaQueryUIModel | null;
    equals(other: MediaQueryUIModel): boolean;
    dimensionsEqual(other: MediaQueryUIModel): boolean;
    compareTo(other: MediaQueryUIModel): number;
    section(): Section;
    mediaText(): string;
    rawLocation(): SDK.CSSModel.CSSLocation | null;
    minWidthExpression(): SDK.CSSMedia.CSSMediaQueryExpression | null;
    maxWidthExpression(): SDK.CSSMedia.CSSMediaQueryExpression | null;
    active(): boolean;
}
