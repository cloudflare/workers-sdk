// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as DataGrid from '../../ui/legacy/components/data_grid/data_grid.js';
import * as UI from '../../ui/legacy/legacy.js';
import { Category, IsLong } from './TimelineFilters.js';
import { TimelineSelection } from './TimelinePanel.js';
import { TimelineTreeView } from './TimelineTreeView.js';
import { TimelineUIUtils } from './TimelineUIUtils.js';
const UIStrings = {
    /**
    *@description Aria-label for filter bar in Event Log view
    */
    filterEventLog: 'Filter event log',
    /**
    *@description Text for the start time of an activity
    */
    startTime: 'Start Time',
    /**
    *@description Screen reader label for a select box that filters the Performance panel Event Log by duration.
    */
    durationFilter: 'Duration filter',
    /**
    *@description Text in Events Timeline Tree View of the Performance panel
    *@example {2} PH1
    */
    Dms: '{PH1} ms',
    /**
    *@description Text for everything
    */
    all: 'All',
};
const str_ = i18n.i18n.registerUIStrings('panels/timeline/EventsTimelineTreeView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class EventsTimelineTreeView extends TimelineTreeView {
    filtersControl;
    delegate;
    currentTree;
    constructor(delegate) {
        super();
        this.filtersControl = new Filters();
        this.filtersControl.addEventListener("FilterChanged" /* FilterChanged */, this.onFilterChanged, this);
        this.init();
        this.delegate = delegate;
        this.dataGrid.markColumnAsSortedBy('startTime', DataGrid.DataGrid.Order.Ascending);
        this.splitWidget.showBoth();
    }
    filters() {
        return [...super.filters(), ...this.filtersControl.filters()];
    }
    updateContents(selection) {
        super.updateContents(selection);
        if (selection.type() === TimelineSelection.Type.TraceEvent) {
            const event = selection.object();
            this.selectEvent(event, true);
        }
    }
    getToolbarInputAccessiblePlaceHolder() {
        return i18nString(UIStrings.filterEventLog);
    }
    buildTree() {
        this.currentTree = this.buildTopDownTree(true, null);
        return this.currentTree;
    }
    onFilterChanged() {
        const lastSelectedNode = this.lastSelectedNode();
        const selectedEvent = lastSelectedNode && lastSelectedNode.event;
        this.refreshTree();
        if (selectedEvent) {
            this.selectEvent(selectedEvent, false);
        }
    }
    findNodeWithEvent(event) {
        const iterators = [this.currentTree.children().values()];
        while (iterators.length) {
            const { done, value: child } = iterators[iterators.length - 1].next();
            if (done) {
                iterators.pop();
                continue;
            }
            if (child.event === event) {
                return child;
            }
            iterators.push(child.children().values());
        }
        return null;
    }
    selectEvent(event, expand) {
        const node = this.findNodeWithEvent(event);
        if (!node) {
            return;
        }
        this.selectProfileNode(node, false);
        if (expand) {
            const dataGridNode = this.dataGridNodeForTreeNode(node);
            if (dataGridNode) {
                dataGridNode.expand();
            }
        }
    }
    populateColumns(columns) {
        columns.push({
            id: 'startTime',
            title: i18nString(UIStrings.startTime),
            width: '80px',
            fixedWidth: true,
            sortable: true,
        });
        super.populateColumns(columns);
        columns.filter(c => c.fixedWidth).forEach(c => {
            c.width = '80px';
        });
    }
    populateToolbar(toolbar) {
        super.populateToolbar(toolbar);
        this.filtersControl.populateToolbar(toolbar);
    }
    showDetailsForNode(node) {
        const traceEvent = node.event;
        if (!traceEvent) {
            return false;
        }
        const model = this.model();
        if (!model) {
            return false;
        }
        void TimelineUIUtils.buildTraceEventDetails(traceEvent, model.timelineModel(), this.linkifier, false)
            .then(fragment => this.detailsView.element.appendChild(fragment));
        return true;
    }
    onHover(node) {
        this.delegate.highlightEvent(node && node.event);
    }
}
export class Filters extends Common.ObjectWrapper.ObjectWrapper {
    categoryFilter;
    durationFilter;
    filtersInternal;
    constructor() {
        super();
        this.categoryFilter = new Category();
        this.durationFilter = new IsLong();
        this.filtersInternal = [this.categoryFilter, this.durationFilter];
    }
    filters() {
        return this.filtersInternal;
    }
    populateToolbar(toolbar) {
        const durationFilterUI = new UI.Toolbar.ToolbarComboBox(durationFilterChanged.bind(this), i18nString(UIStrings.durationFilter));
        for (const durationMs of Filters.durationFilterPresetsMs) {
            durationFilterUI.addOption(durationFilterUI.createOption(durationMs ? `≥ ${i18nString(UIStrings.Dms, { PH1: durationMs })}` : i18nString(UIStrings.all), String(durationMs)));
        }
        toolbar.appendToolbarItem(durationFilterUI);
        const categoryFiltersUI = new Map();
        const categories = TimelineUIUtils.categories();
        for (const categoryName in categories) {
            const category = categories[categoryName];
            if (!category.visible) {
                continue;
            }
            const checkbox = new UI.Toolbar.ToolbarCheckbox(category.title, undefined, categoriesFilterChanged.bind(this, categoryName));
            checkbox.setChecked(true);
            checkbox.inputElement.style.backgroundColor = category.color;
            categoryFiltersUI.set(category.name, checkbox);
            toolbar.appendToolbarItem(checkbox);
        }
        function durationFilterChanged() {
            const duration = durationFilterUI.selectedOption().value;
            const minimumRecordDuration = parseInt(duration, 10);
            this.durationFilter.setMinimumRecordDuration(minimumRecordDuration);
            this.notifyFiltersChanged();
        }
        function categoriesFilterChanged(name) {
            const categories = TimelineUIUtils.categories();
            const checkBox = categoryFiltersUI.get(name);
            categories[name].hidden = !checkBox || !checkBox.checked();
            this.notifyFiltersChanged();
        }
    }
    notifyFiltersChanged() {
        this.dispatchEventToListeners("FilterChanged" /* FilterChanged */);
    }
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/naming-convention
    static durationFilterPresetsMs = [0, 1, 15];
}
//# sourceMappingURL=EventsTimelineTreeView.js.map