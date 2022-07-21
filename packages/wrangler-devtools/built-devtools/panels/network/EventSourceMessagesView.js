// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import eventSourceMessagesViewStyles from './eventSourceMessagesView.css.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as DataGrid from '../../ui/legacy/components/data_grid/data_grid.js';
import * as UI from '../../ui/legacy/legacy.js';
const UIStrings = {
    /**
    *@description Text in Event Source Messages View of the Network panel
    */
    id: 'Id',
    /**
    *@description Text that refers to some types
    */
    type: 'Type',
    /**
    *@description Text in Event Source Messages View of the Network panel
    */
    data: 'Data',
    /**
    *@description Text that refers to the time
    */
    time: 'Time',
    /**
    *@description Data grid name for Event Source data grids
    */
    eventSource: 'Event Source',
    /**
    *@description A context menu item in the Resource Web Socket Frame View of the Network panel
    */
    copyMessage: 'Copy message',
};
const str_ = i18n.i18n.registerUIStrings('panels/network/EventSourceMessagesView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class EventSourceMessagesView extends UI.Widget.VBox {
    request;
    dataGrid;
    constructor(request) {
        super();
        this.element.classList.add('event-source-messages-view');
        this.request = request;
        const columns = [
            { id: 'id', title: i18nString(UIStrings.id), sortable: true, weight: 8 },
            { id: 'type', title: i18nString(UIStrings.type), sortable: true, weight: 8 },
            { id: 'data', title: i18nString(UIStrings.data), sortable: false, weight: 88 },
            { id: 'time', title: i18nString(UIStrings.time), sortable: true, weight: 8 },
        ];
        this.dataGrid = new DataGrid.SortableDataGrid.SortableDataGrid({
            displayName: i18nString(UIStrings.eventSource),
            columns,
            editCallback: undefined,
            deleteCallback: undefined,
            refreshCallback: undefined,
        });
        this.dataGrid.setStriped(true);
        this.dataGrid.setStickToBottom(true);
        this.dataGrid.setRowContextMenuCallback(this.onRowContextMenu.bind(this));
        this.dataGrid.markColumnAsSortedBy('time', DataGrid.DataGrid.Order.Ascending);
        this.sortItems();
        this.dataGrid.addEventListener(DataGrid.DataGrid.Events.SortingChanged, this.sortItems, this);
        this.dataGrid.setName('EventSourceMessagesView');
        this.dataGrid.asWidget().show(this.element);
    }
    wasShown() {
        this.dataGrid.rootNode().removeChildren();
        this.registerCSSFiles([eventSourceMessagesViewStyles]);
        const messages = this.request.eventSourceMessages();
        for (let i = 0; i < messages.length; ++i) {
            this.dataGrid.insertChild(new EventSourceMessageNode(messages[i]));
        }
        this.request.addEventListener(SDK.NetworkRequest.Events.EventSourceMessageAdded, this.messageAdded, this);
    }
    willHide() {
        this.request.removeEventListener(SDK.NetworkRequest.Events.EventSourceMessageAdded, this.messageAdded, this);
    }
    messageAdded(event) {
        const message = event.data;
        this.dataGrid.insertChild(new EventSourceMessageNode(message));
    }
    sortItems() {
        const sortColumnId = this.dataGrid.sortColumnId();
        if (!sortColumnId) {
            return;
        }
        const comparator = Comparators[sortColumnId];
        if (!comparator) {
            return;
        }
        this.dataGrid.sortNodes(comparator, !this.dataGrid.isSortOrderAscending());
    }
    onRowContextMenu(contextMenu, node) {
        contextMenu.clipboardSection().appendItem(i18nString(UIStrings.copyMessage), Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText.bind(Host.InspectorFrontendHost.InspectorFrontendHostInstance, node.data.data));
    }
}
export class EventSourceMessageNode extends DataGrid.SortableDataGrid.SortableDataGridNode {
    message;
    constructor(message) {
        const time = new Date(message.time * 1000);
        const timeText = ('0' + time.getHours()).substr(-2) + ':' + ('0' + time.getMinutes()).substr(-2) + ':' +
            ('0' + time.getSeconds()).substr(-2) + '.' + ('00' + time.getMilliseconds()).substr(-3);
        const timeNode = document.createElement('div');
        UI.UIUtils.createTextChild(timeNode, timeText);
        UI.Tooltip.Tooltip.install(timeNode, time.toLocaleString());
        super({ id: message.eventId, type: message.eventName, data: message.data, time: timeNode });
        this.message = message;
    }
}
// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
// eslint-disable-next-line @typescript-eslint/naming-convention
export function EventSourceMessageNodeComparator(fieldGetter, a, b) {
    const aValue = fieldGetter(a.message);
    const bValue = fieldGetter(b.message);
    return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
}
export const Comparators = {
    'id': EventSourceMessageNodeComparator.bind(null, message => message.eventId),
    'type': EventSourceMessageNodeComparator.bind(null, message => message.eventName),
    'time': EventSourceMessageNodeComparator.bind(null, message => message.time),
};
//# sourceMappingURL=EventSourceMessagesView.js.map