/**
 * Copyright (C) 2013 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Common from '../../../../core/common/common.js';
import * as Platform from '../../../../core/platform/platform.js';
import type * as SDK from '../../../../core/sdk/sdk.js';
import type * as TimelineModel from '../../../../models/timeline_model/timeline_model.js';
import * as UI from '../../legacy.js';
import type { ChartViewportDelegate } from './ChartViewport.js';
import type { Calculator } from './TimelineGrid.js';
export declare class FlameChartDelegate {
    windowChanged(_startTime: number, _endTime: number, _animate: boolean): void;
    updateRangeSelection(_startTime: number, _endTime: number): void;
    updateSelectedGroup(_flameChart: FlameChart, _group: Group | null): void;
}
interface GroupExpansionState {
    [key: string]: boolean;
}
declare const FlameChart_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<EventTypes>;
    addEventListener<T extends keyof EventTypes>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<EventTypes, T>;
    once<T_1 extends keyof EventTypes>(eventType: T_1): Promise<EventTypes[T_1]>;
    removeEventListener<T_2 extends keyof EventTypes>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: keyof EventTypes): boolean;
    dispatchEventToListeners<T_3 extends keyof EventTypes>(eventType: Platform.TypeScriptUtilities.NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<EventTypes, T_3>): void;
}) & typeof UI.Widget.VBox;
export declare class FlameChart extends FlameChart_base implements Calculator, ChartViewportDelegate {
    private readonly groupExpansionSetting?;
    private groupExpansionState;
    private readonly flameChartDelegate;
    private useWebGL;
    private chartViewport;
    private dataProvider;
    private candyStripeCanvas;
    private viewportElement;
    private canvasGL;
    private canvas;
    private entryInfo;
    private readonly markerHighlighElement;
    private readonly highlightElement;
    private readonly selectedElement;
    private rulerEnabled;
    private readonly rangeSelectionStart;
    private readonly rangeSelectionEnd;
    private barHeight;
    private textBaseline;
    private textPadding;
    private readonly markerRadius;
    private readonly headerLeftPadding;
    private arrowSide;
    private readonly expansionArrowIndent;
    private readonly headerLabelXPadding;
    private readonly headerLabelYPadding;
    private highlightedMarkerIndex;
    private highlightedEntryIndex;
    private selectedEntryIndex;
    private rawTimelineDataLength;
    private textWidth;
    private readonly markerPositions;
    private lastMouseOffsetX;
    private selectedGroup;
    private keyboardFocusedGroup;
    private offsetWidth;
    private offsetHeight;
    private dragStartX;
    private dragStartY;
    private lastMouseOffsetY;
    private minimumBoundaryInternal;
    private maxDragOffset;
    private shaderProgram?;
    private vertexBuffer?;
    private colorBuffer?;
    private uScalingFactor?;
    private uShiftVector?;
    private aVertexPosition?;
    private aVertexColor?;
    private vertexCount?;
    private prevTimelineData?;
    private timelineLevels?;
    private visibleLevelOffsets?;
    private visibleLevels?;
    private groupOffsets?;
    private rawTimelineData?;
    private forceDecorationCache?;
    private entryColorsCache?;
    private visibleLevelHeights?;
    private totalTime?;
    constructor(dataProvider: FlameChartDataProvider, flameChartDelegate: FlameChartDelegate, groupExpansionSetting?: Common.Settings.Setting<GroupExpansionState>);
    willHide(): void;
    setBarHeight(value: number): void;
    setTextBaseline(value: number): void;
    setTextPadding(value: number): void;
    enableRuler(enable: boolean): void;
    alwaysShowVerticalScroll(): void;
    disableRangeSelection(): void;
    highlightEntry(entryIndex: number): void;
    hideHighlight(): void;
    private createCandyStripePattern;
    private resetCanvas;
    windowChanged(startTime: number, endTime: number, animate: boolean): void;
    updateRangeSelection(startTime: number, endTime: number): void;
    setSize(width: number, height: number): void;
    private startDragging;
    private dragging;
    private endDragging;
    private timelineData;
    private revealEntry;
    setWindowTimes(startTime: number, endTime: number, animate?: boolean): void;
    private onMouseMove;
    private updateHighlight;
    private onMouseOut;
    private updatePopover;
    private updatePopoverOffset;
    private onClick;
    private selectGroup;
    private deselectAllGroups;
    private deselectAllEntries;
    private isGroupFocused;
    private scrollGroupIntoView;
    private toggleGroupExpand;
    private expandGroup;
    private onKeyDown;
    bindCanvasEvent(eventName: string, onEvent: (arg0: Event) => void): void;
    private handleKeyboardGroupNavigation;
    private selectFirstEntryInCurrentGroup;
    private selectPreviousGroup;
    private selectNextGroup;
    private getGroupIndexToSelect;
    private selectFirstChild;
    private handleSelectionNavigation;
    private coordinatesToEntryIndex;
    private coordinatesToGroupIndex;
    private markerIndexAtPosition;
    private markerIndexBeforeTime;
    private draw;
    private initWebGL;
    private setupGLGeometry;
    private drawGL;
    private drawGroupHeaders;
    private forEachGroup;
    private forEachGroupInViewport;
    private labelWidthForGroup;
    private drawCollapsedOverviewForGroup;
    private drawFlowEvents;
    private drawMarkers;
    private updateMarkerHighlight;
    private processTimelineData;
    private updateLevelPositions;
    private isGroupCollapsible;
    setSelectedEntry(entryIndex: number): void;
    private updateElementPosition;
    private timeToPositionClipped;
    private levelToOffset;
    private levelHeight;
    private updateBoundaries;
    private updateHeight;
    onResize(): void;
    update(): void;
    reset(): void;
    scheduleUpdate(): void;
    private enabled;
    computePosition(time: number): number;
    formatValue(value: number, precision?: number): string;
    maximumBoundary(): number;
    minimumBoundary(): number;
    zeroTime(): number;
    boundarySpan(): number;
}
export declare const HeaderHeight = 15;
export declare const MinimalTimeWindowMs = 0.5;
export declare class TimelineData {
    entryLevels: number[] | Uint16Array;
    entryTotalTimes: number[] | Float32Array;
    entryStartTimes: number[] | Float64Array;
    groups: Group[];
    markers: FlameChartMarker[];
    flowStartTimes: number[];
    flowStartLevels: number[];
    flowEndTimes: number[];
    flowEndLevels: number[];
    selectedGroup: Group | null;
    constructor(entryLevels: number[] | Uint16Array, entryTotalTimes: number[] | Float32Array, entryStartTimes: number[] | Float64Array, groups: Group[] | null);
}
export interface FlameChartDataProvider {
    minimumBoundary(): number;
    totalTime(): number;
    formatValue(value: number, precision?: number): string;
    maxStackDepth(): number;
    timelineData(): TimelineData | null;
    prepareHighlightedEntryInfo(entryIndex: number): Element | null;
    canJumpToEntry(entryIndex: number): boolean;
    entryTitle(entryIndex: number): string | null;
    entryFont(entryIndex: number): string | null;
    entryColor(entryIndex: number): string;
    decorateEntry(entryIndex: number, context: CanvasRenderingContext2D, text: string | null, barX: number, barY: number, barWidth: number, barHeight: number, unclippedBarX: number, timeToPixelRatio: number): boolean;
    forceDecoration(entryIndex: number): boolean;
    textColor(entryIndex: number): string;
    navStartTimes(): Map<string, SDK.TracingModel.Event>;
}
export interface FlameChartMarker {
    startTime(): number;
    color(): string;
    title(): string | null;
    draw(context: CanvasRenderingContext2D, x: number, height: number, pixelsPerMillisecond: number): void;
}
export declare enum Events {
    CanvasFocused = "CanvasFocused",
    EntryInvoked = "EntryInvoked",
    EntrySelected = "EntrySelected",
    EntryHighlighted = "EntryHighlighted"
}
export declare type EventTypes = {
    [Events.CanvasFocused]: number | void;
    [Events.EntryInvoked]: number;
    [Events.EntrySelected]: number;
    [Events.EntryHighlighted]: number;
};
export interface Group {
    name: Common.UIString.LocalizedString;
    startLevel: number;
    expanded?: boolean;
    selectable?: boolean;
    style: {
        height: number;
        padding: number;
        collapsible: boolean;
        font: string;
        color: string;
        backgroundColor: string;
        nestingLevel: number;
        itemsHeight?: number;
        shareHeaderLine?: boolean;
        useFirstLineForOverview?: boolean;
        useDecoratorsForOverview?: boolean;
    };
    track?: TimelineModel.TimelineModel.Track | null;
}
export interface GroupStyle {
    height: number;
    padding: number;
    collapsible: boolean;
    font: string;
    color: string;
    backgroundColor: string;
    nestingLevel: number;
    itemsHeight?: number;
    shareHeaderLine?: boolean;
    useFirstLineForOverview?: boolean;
    useDecoratorsForOverview?: boolean;
}
export {};
