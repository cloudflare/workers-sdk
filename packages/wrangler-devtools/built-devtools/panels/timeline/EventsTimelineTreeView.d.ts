import * as Common from '../../core/common/common.js';
import type * as TimelineModel from '../../models/timeline_model/timeline_model.js';
import * as DataGrid from '../../ui/legacy/components/data_grid/data_grid.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { TimelineModeViewDelegate } from './TimelinePanel.js';
import { TimelineSelection } from './TimelinePanel.js';
import { TimelineTreeView } from './TimelineTreeView.js';
export declare class EventsTimelineTreeView extends TimelineTreeView {
    private readonly filtersControl;
    private readonly delegate;
    private currentTree;
    constructor(delegate: TimelineModeViewDelegate);
    filters(): TimelineModel.TimelineModelFilter.TimelineModelFilter[];
    updateContents(selection: TimelineSelection): void;
    getToolbarInputAccessiblePlaceHolder(): string;
    buildTree(): TimelineModel.TimelineProfileTree.Node;
    private onFilterChanged;
    private findNodeWithEvent;
    private selectEvent;
    populateColumns(columns: DataGrid.DataGrid.ColumnDescriptor[]): void;
    populateToolbar(toolbar: UI.Toolbar.Toolbar): void;
    showDetailsForNode(node: TimelineModel.TimelineProfileTree.Node): boolean;
    onHover(node: TimelineModel.TimelineProfileTree.Node | null): void;
}
export declare class Filters extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    private readonly categoryFilter;
    private readonly durationFilter;
    private readonly filtersInternal;
    constructor();
    filters(): TimelineModel.TimelineModelFilter.TimelineModelFilter[];
    populateToolbar(toolbar: UI.Toolbar.Toolbar): void;
    private notifyFiltersChanged;
    private static readonly durationFilterPresetsMs;
}
declare const enum Events {
    FilterChanged = "FilterChanged"
}
declare type EventTypes = {
    [Events.FilterChanged]: void;
};
export {};
