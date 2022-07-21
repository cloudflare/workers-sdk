// Copyright (c) 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as TextUtils from '../../models/text_utils/text_utils.js';
import * as DataGrid from '../../ui/legacy/components/data_grid/data_grid.js';
import * as UI from '../../ui/legacy/legacy.js';
import developerResourcesListViewStyles from './developerResourcesListView.css.js';
const UIStrings = {
    /**
    *@description Text for the status of something
    */
    status: 'Status',
    /**
    *@description Text for web URLs
    */
    url: 'URL',
    /**
    *@description Text for the initiator of something
    */
    initiator: 'Initiator',
    /**
    *@description Text in Coverage List View of the Coverage tab
    */
    totalBytes: 'Total Bytes',
    /**
    *@description Text for errors
    */
    error: 'Error',
    /**
    *@description Title for the developer resources tab
    */
    developerResources: 'Developer Resources',
    /**
    *@description Text for a context menu entry
    */
    copyUrl: 'Copy URL',
    /**
    * @description Text for a context menu entry. Command to copy a URL to the clipboard. The initiator
    * of a request is the entity that caused this request to be sent.
    */
    copyInitiatorUrl: 'Copy initiator URL',
    /**
    *@description Text for the status column of a list view
    */
    pending: 'pending',
    /**
    *@description Text for the status column of a list view
    */
    success: 'success',
    /**
    *@description Text for the status column of a list view
    */
    failure: 'failure',
    /**
    *@description Accessible text for the value in bytes in memory allocation.
    */
    sBytes: '{n, plural, =1 {# byte} other {# bytes}}',
};
const str_ = i18n.i18n.registerUIStrings('panels/developer_resources/DeveloperResourcesListView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class DeveloperResourcesListView extends UI.Widget.VBox {
    nodeForItem;
    isVisibleFilter;
    highlightRegExp;
    dataGrid;
    constructor(isVisibleFilter) {
        super(true);
        this.nodeForItem = new Map();
        this.isVisibleFilter = isVisibleFilter;
        this.highlightRegExp = null;
        const columns = [
            { id: 'status', title: i18nString(UIStrings.status), width: '60px', fixedWidth: true, sortable: true },
            { id: 'url', title: i18nString(UIStrings.url), width: '250px', fixedWidth: false, sortable: true },
            { id: 'initiator', title: i18nString(UIStrings.initiator), width: '80px', fixedWidth: false, sortable: true },
            {
                id: 'size',
                title: i18nString(UIStrings.totalBytes),
                width: '80px',
                fixedWidth: true,
                sortable: true,
                align: DataGrid.DataGrid.Align.Right,
            },
            {
                id: 'errorMessage',
                title: i18nString(UIStrings.error),
                width: '200px',
                fixedWidth: false,
                sortable: true,
            },
        ];
        this.dataGrid = new DataGrid.SortableDataGrid.SortableDataGrid({
            displayName: i18nString(UIStrings.developerResources),
            columns,
            editCallback: undefined,
            refreshCallback: undefined,
            deleteCallback: undefined,
        });
        this.dataGrid.setResizeMethod(DataGrid.DataGrid.ResizeMethod.Last);
        this.dataGrid.element.classList.add('flex-auto');
        this.dataGrid.addEventListener(DataGrid.DataGrid.Events.SortingChanged, this.sortingChanged, this);
        this.dataGrid.setRowContextMenuCallback(this.populateContextMenu.bind(this));
        const dataGridWidget = this.dataGrid.asWidget();
        dataGridWidget.show(this.contentElement);
        this.setDefaultFocusedChild(dataGridWidget);
    }
    populateContextMenu(contextMenu, gridNode) {
        const item = gridNode.item;
        contextMenu.clipboardSection().appendItem(i18nString(UIStrings.copyUrl), () => {
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(item.url);
        });
        if (item.initiator.initiatorUrl) {
            contextMenu.clipboardSection().appendItem(i18nString(UIStrings.copyInitiatorUrl), () => {
                Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(item.initiator.initiatorUrl);
            });
        }
    }
    update(items) {
        let hadUpdates = false;
        const rootNode = this.dataGrid.rootNode();
        for (const item of items) {
            let node = this.nodeForItem.get(item);
            if (node) {
                if (this.isVisibleFilter(node.item)) {
                    hadUpdates = node.refreshIfNeeded() || hadUpdates;
                }
                continue;
            }
            node = new GridNode(item);
            this.nodeForItem.set(item, node);
            if (this.isVisibleFilter(node.item)) {
                rootNode.appendChild(node);
                hadUpdates = true;
            }
        }
        if (hadUpdates) {
            this.sortingChanged();
        }
    }
    reset() {
        this.nodeForItem.clear();
        this.dataGrid.rootNode().removeChildren();
    }
    updateFilterAndHighlight(highlightRegExp) {
        this.highlightRegExp = highlightRegExp;
        let hadTreeUpdates = false;
        for (const node of this.nodeForItem.values()) {
            const shouldBeVisible = this.isVisibleFilter(node.item);
            const isVisible = Boolean(node.parent);
            if (shouldBeVisible) {
                node.setHighlight(this.highlightRegExp);
            }
            if (shouldBeVisible === isVisible) {
                continue;
            }
            hadTreeUpdates = true;
            if (!shouldBeVisible) {
                node.remove();
            }
            else {
                this.dataGrid.rootNode().appendChild(node);
            }
        }
        if (hadTreeUpdates) {
            this.sortingChanged();
        }
    }
    sortingChanged() {
        const columnId = this.dataGrid.sortColumnId();
        if (!columnId) {
            return;
        }
        const sortFunction = GridNode.sortFunctionForColumn(columnId);
        if (sortFunction) {
            this.dataGrid.sortNodes(sortFunction, !this.dataGrid.isSortOrderAscending());
        }
    }
    wasShown() {
        super.wasShown();
        this.registerCSSFiles([developerResourcesListViewStyles]);
    }
}
class GridNode extends DataGrid.SortableDataGrid.SortableDataGridNode {
    item;
    highlightRegExp;
    constructor(item) {
        super();
        this.item = item;
        this.highlightRegExp = null;
    }
    setHighlight(highlightRegExp) {
        if (this.highlightRegExp === highlightRegExp) {
            return;
        }
        this.highlightRegExp = highlightRegExp;
        this.refresh();
    }
    refreshIfNeeded() {
        this.refresh();
        return true;
    }
    createCell(columnId) {
        const cell = this.createTD(columnId);
        switch (columnId) {
            case 'url': {
                UI.Tooltip.Tooltip.install(cell, this.item.url);
                const outer = cell.createChild('div', 'url-outer');
                const prefix = outer.createChild('div', 'url-prefix');
                const suffix = outer.createChild('div', 'url-suffix');
                const splitURL = /^(.*)(\/[^/]*)$/.exec(this.item.url);
                prefix.textContent = splitURL ? splitURL[1] : this.item.url;
                suffix.textContent = splitURL ? splitURL[2] : '';
                if (this.highlightRegExp) {
                    this.highlight(outer, this.item.url);
                }
                this.setCellAccessibleName(this.item.url, cell, columnId);
                break;
            }
            case 'initiator': {
                const url = this.item.initiator.initiatorUrl || '';
                cell.textContent = url;
                UI.Tooltip.Tooltip.install(cell, url);
                this.setCellAccessibleName(url, cell, columnId);
                cell.onmouseenter = () => {
                    const frameId = this.item.initiator.frameId;
                    const frame = frameId ? SDK.FrameManager.FrameManager.instance().getFrame(frameId) : null;
                    if (frame) {
                        void frame.highlight();
                    }
                };
                cell.onmouseleave = () => SDK.OverlayModel.OverlayModel.hideDOMNodeHighlight();
                break;
            }
            case 'status': {
                if (this.item.success === null) {
                    cell.textContent = i18nString(UIStrings.pending);
                }
                else {
                    cell.textContent = this.item.success ? i18nString(UIStrings.success) : i18nString(UIStrings.failure);
                }
                break;
            }
            case 'size': {
                const size = this.item.size;
                if (size !== null) {
                    const sizeSpan = cell.createChild('span');
                    sizeSpan.textContent = Platform.NumberUtilities.withThousandsSeparator(size);
                    const sizeAccessibleName = i18nString(UIStrings.sBytes, { n: size });
                    this.setCellAccessibleName(sizeAccessibleName, cell, columnId);
                }
                break;
            }
            case 'errorMessage': {
                cell.classList.add('error-message');
                if (this.item.errorMessage) {
                    cell.textContent = this.item.errorMessage;
                    if (this.highlightRegExp) {
                        this.highlight(cell, this.item.errorMessage);
                    }
                }
                break;
            }
        }
        return cell;
    }
    highlight(element, textContent) {
        if (!this.highlightRegExp) {
            return;
        }
        const matches = this.highlightRegExp.exec(textContent);
        if (!matches || !matches.length) {
            return;
        }
        const range = new TextUtils.TextRange.SourceRange(matches.index, matches[0].length);
        UI.UIUtils.highlightRangesWithStyleClass(element, [range], 'filter-highlight');
    }
    static sortFunctionForColumn(columnId) {
        const nullToNegative = (x) => x === null ? -1 : Number(x);
        switch (columnId) {
            case 'url':
                return (a, b) => a.item.url.localeCompare(b.item.url);
            case 'status':
                return (a, b) => {
                    return nullToNegative(a.item.success) - nullToNegative(b.item.success);
                };
            case 'size':
                return (a, b) => nullToNegative(a.item.size) - nullToNegative(b.item.size);
            case 'initiator':
                return (a, b) => (a.item.initiator.initiatorUrl || '').localeCompare(b.item.initiator.initiatorUrl || '');
            case 'errorMessage':
                return (a, b) => (a.item.errorMessage || '').localeCompare(b.item.errorMessage || '');
            default:
                console.assert(false, 'Unknown sort field: ' + columnId);
                return null;
        }
    }
}
//# sourceMappingURL=DeveloperResourcesListView.js.map