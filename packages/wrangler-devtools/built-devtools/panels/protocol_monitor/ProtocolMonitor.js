// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as ProtocolClient from '../../core/protocol_client/protocol_client.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Bindings from '../../models/bindings/bindings.js';
import * as TextUtils from '../../models/text_utils/text_utils.js';
import * as DataGrid from '../../ui/components/data_grid/data_grid.js';
import * as IconButton from '../../ui/components/icon_button/icon_button.js';
import * as SourceFrame from '../../ui/legacy/components/source_frame/source_frame.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as LitHtml from '../../ui/lit-html/lit-html.js';
import protocolMonitorStyles from './protocolMonitor.css.js';
const UIStrings = {
    /**
    *@description Text for one or a group of functions
    */
    method: 'Method',
    /**
    * @description Text in Protocol Monitor. Title for a table column which shows in which direction
    * the particular protocol message was travelling. Values in this column will either be 'sent' or
    * 'received'.
    */
    type: 'Type',
    /**
    * @description Text in Protocol Monitor of the Protocol Monitor tab. Noun relating to a network request.
    */
    request: 'Request',
    /**
    *@description Title of a cell content in protocol monitor. A Network response refers to the act of acknowledging a
    network request. Should not be confused with answer.
    */
    response: 'Response',
    /**
    *@description Text for timestamps of items
    */
    timestamp: 'Timestamp',
    /**
    *@description Text in Protocol Monitor of the Protocol Monitor tab
    */
    target: 'Target',
    /**
    *@description Text to record a series of actions for analysis
    */
    record: 'Record',
    /**
    *@description Text to clear everything
    */
    clearAll: 'Clear all',
    /**
    *@description Text to filter result items
    */
    filter: 'Filter',
    /**
    *@description Text for the documentation of something
    */
    documentation: 'Documentation',
    /**
    *@description Cell text content in Protocol Monitor of the Protocol Monitor tab
    *@example {30} PH1
    */
    sMs: '{PH1} ms',
    /**
    *@description Text in Protocol Monitor of the Protocol Monitor tab
    */
    noMessageSelected: 'No message selected',
    /**
    *@description Text in Protocol Monitor for the save button
    */
    save: 'Save',
    /**
    *@description Text in Protocol Monitor to describe the sessions column
    */
    session: 'Session',
    /**
    *@description A placeholder for an input in Protocol Monitor. The input accepts commands that are sent to the backend on Enter. CDP stands for Chrome DevTools Protocol.
    */
    sendRawCDPCommand: 'Send a raw `CDP` command',
};
const str_ = i18n.i18n.registerUIStrings('panels/protocol_monitor/ProtocolMonitor.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const timestampRenderer = (value) => {
    return LitHtml.html `${i18nString(UIStrings.sMs, { PH1: String(value) })}`;
};
let protocolMonitorImplInstance;
export class ProtocolMonitorImpl extends UI.Widget.VBox {
    started;
    startTime;
    dataGridRowForId;
    infoWidget;
    dataGridIntegrator;
    filterParser;
    suggestionBuilder;
    textFilterUI;
    messages = [];
    isRecording = false;
    constructor() {
        super(true);
        this.started = false;
        this.startTime = 0;
        this.dataGridRowForId = new Map();
        const topToolbar = new UI.Toolbar.Toolbar('protocol-monitor-toolbar', this.contentElement);
        this.contentElement.classList.add('protocol-monitor');
        const recordButton = new UI.Toolbar.ToolbarToggle(i18nString(UIStrings.record), 'largeicon-start-recording', 'largeicon-stop-recording');
        recordButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, () => {
            recordButton.setToggled(!recordButton.toggled());
            this.setRecording(recordButton.toggled());
        });
        recordButton.setToggleWithRedColor(true);
        topToolbar.appendToolbarItem(recordButton);
        recordButton.setToggled(true);
        const clearButton = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.clearAll), 'largeicon-clear');
        clearButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, () => {
            this.messages = [];
            this.dataGridIntegrator.update({ ...this.dataGridIntegrator.data(), rows: [] });
            this.infoWidget.render(null);
        });
        topToolbar.appendToolbarItem(clearButton);
        const saveButton = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.save), 'largeicon-download');
        saveButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, () => {
            void this.saveAsFile();
        });
        topToolbar.appendToolbarItem(saveButton);
        const split = new UI.SplitWidget.SplitWidget(true, true, 'protocol-monitor-panel-split', 250);
        split.show(this.contentElement);
        this.infoWidget = new InfoWidget();
        const dataGridInitialData = {
            columns: [
                {
                    id: 'type',
                    title: i18nString(UIStrings.type),
                    sortable: true,
                    widthWeighting: 1,
                    visible: true,
                    hideable: true,
                    styles: {
                        'text-align': 'center',
                    },
                },
                {
                    id: 'method',
                    title: i18nString(UIStrings.method),
                    sortable: false,
                    widthWeighting: 5,
                    visible: true,
                    hideable: false,
                },
                {
                    id: 'request',
                    title: i18nString(UIStrings.request),
                    sortable: false,
                    widthWeighting: 5,
                    visible: true,
                    hideable: true,
                },
                {
                    id: 'response',
                    title: i18nString(UIStrings.response),
                    sortable: false,
                    widthWeighting: 5,
                    visible: true,
                    hideable: true,
                },
                {
                    id: 'timestamp',
                    title: i18nString(UIStrings.timestamp),
                    sortable: true,
                    widthWeighting: 5,
                    visible: false,
                    hideable: true,
                },
                {
                    id: 'target',
                    title: i18nString(UIStrings.target),
                    sortable: true,
                    widthWeighting: 5,
                    visible: false,
                    hideable: true,
                },
                {
                    id: 'session',
                    title: i18nString(UIStrings.session),
                    sortable: true,
                    widthWeighting: 5,
                    visible: false,
                    hideable: true,
                },
            ],
            rows: [],
            contextMenus: {
                bodyRow: (menu, columns, row) => {
                    const methodColumn = DataGrid.DataGridUtils.getRowEntryForColumnId(row, 'method');
                    const typeColumn = DataGrid.DataGridUtils.getRowEntryForColumnId(row, 'type');
                    /**
                   * You can click the "Filter" item in the context menu to filter the
                   * protocol monitor entries to those that match the method of the
                   * current row.
                   */
                    menu.defaultSection().appendItem(i18nString(UIStrings.filter), () => {
                        const methodColumn = DataGrid.DataGridUtils.getRowEntryForColumnId(row, 'method');
                        this.textFilterUI.setValue(`method:${methodColumn.value}`, true);
                    });
                    /**
                   * You can click the "Documentation" item in the context menu to be
                   * taken to the CDP Documentation site entry for the given method.
                   */
                    menu.defaultSection().appendItem(i18nString(UIStrings.documentation), () => {
                        if (!methodColumn.value) {
                            return;
                        }
                        const [domain, method] = String(methodColumn.value).split('.');
                        const type = typeColumn.value === 'sent' ? 'method' : 'event';
                        Host.InspectorFrontendHost.InspectorFrontendHostInstance.openInNewTab(`https://chromedevtools.github.io/devtools-protocol/tot/${domain}#${type}-${method}`);
                    });
                },
            },
        };
        this.dataGridIntegrator =
            new DataGrid.DataGridControllerIntegrator.DataGridControllerIntegrator(dataGridInitialData);
        this.dataGridIntegrator.dataGrid.addEventListener('cellfocused', event => {
            const focusedRow = event.data.row;
            const infoWidgetData = {
                request: DataGrid.DataGridUtils.getRowEntryForColumnId(focusedRow, 'request'),
                response: DataGrid.DataGridUtils.getRowEntryForColumnId(focusedRow, 'response'),
                type: DataGrid.DataGridUtils.getRowEntryForColumnId(focusedRow, 'type').title,
            };
            this.infoWidget.render(infoWidgetData);
        });
        this.dataGridIntegrator.dataGrid.addEventListener('newuserfiltertext', event => {
            this.textFilterUI.setValue(event.data.filterText, /* notify listeners */ true);
        });
        split.setMainWidget(this.dataGridIntegrator);
        split.setSidebarWidget(this.infoWidget);
        const keys = ['method', 'request', 'response', 'type', 'target', 'session'];
        this.filterParser = new TextUtils.TextUtils.FilterParser(keys);
        this.suggestionBuilder = new UI.FilterSuggestionBuilder.FilterSuggestionBuilder(keys);
        this.textFilterUI = new UI.Toolbar.ToolbarInput(i18nString(UIStrings.filter), '', 1, .2, '', this.suggestionBuilder.completions.bind(this.suggestionBuilder), true);
        this.textFilterUI.addEventListener(UI.Toolbar.ToolbarInput.Event.TextChanged, event => {
            const query = event.data;
            const filters = this.filterParser.parse(query);
            this.dataGridIntegrator.update({ ...this.dataGridIntegrator.data(), filters });
        });
        topToolbar.appendToolbarItem(this.textFilterUI);
        const onSend = () => {
            const value = input.value();
            // If input cannot be parsed as json, we assume it's the command name
            // for a command without parameters. Otherwise, we expect an object
            // with "command" and "parameters" attributes.
            let json = null;
            try {
                json = JSON.parse(value);
            }
            catch (err) {
            }
            const command = json ? json.command : value;
            const parameters = json ? json.parameters : null;
            const test = ProtocolClient.InspectorBackend.test;
            // TODO: TS thinks that properties are read-only because
            // in TS test is defined as a namespace.
            // @ts-ignore
            test.sendRawMessage(command, parameters, () => { });
        };
        const input = new UI.Toolbar.ToolbarInput(i18nString(UIStrings.sendRawCDPCommand), '', 1, .2, '', undefined, false);
        input.addEventListener(UI.Toolbar.ToolbarInput.Event.EnterPressed, onSend);
        const bottomToolbar = new UI.Toolbar.Toolbar('protocol-monitor-bottom-toolbar', this.contentElement);
        bottomToolbar.appendToolbarItem(input);
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!protocolMonitorImplInstance || forceNew) {
            protocolMonitorImplInstance = new ProtocolMonitorImpl();
        }
        return protocolMonitorImplInstance;
    }
    wasShown() {
        if (this.started) {
            return;
        }
        this.registerCSSFiles([protocolMonitorStyles]);
        this.started = true;
        this.startTime = Date.now();
        this.setRecording(true);
    }
    setRecording(recording) {
        this.isRecording = recording;
        const test = ProtocolClient.InspectorBackend.test;
        if (recording) {
            // TODO: TS thinks that properties are read-only because
            // in TS test is defined as a namespace.
            // @ts-ignore
            test.onMessageSent = this.messageSent.bind(this);
            // @ts-ignore
            test.onMessageReceived = this.messageReceived.bind(this);
        }
        else {
            // @ts-ignore
            test.onMessageSent = null;
            // @ts-ignore
            test.onMessageReceived = null;
        }
    }
    targetToString(target) {
        if (!target) {
            return '';
        }
        return target.decorateLabel(`${target.name()} ${target === SDK.TargetManager.TargetManager.instance().mainTarget() ? '' : target.id()}`);
    }
    // eslint-disable
    messageReceived(message, target) {
        if (this.isRecording) {
            this.messages.push({ ...message, type: 'recv', domain: '-' });
        }
        if ('id' in message && message.id) {
            const existingRow = this.dataGridRowForId.get(message.id);
            if (!existingRow) {
                return;
            }
            const allExistingRows = this.dataGridIntegrator.data().rows;
            const matchingExistingRowIndex = allExistingRows.findIndex(r => existingRow === r);
            const newRowWithUpdate = {
                ...existingRow,
                cells: existingRow.cells.map(cell => {
                    if (cell.columnId === 'response') {
                        return {
                            ...cell,
                            value: JSON.stringify(message.result || message.error),
                        };
                    }
                    return cell;
                }),
            };
            const newRowsArray = [...this.dataGridIntegrator.data().rows];
            newRowsArray[matchingExistingRowIndex] = newRowWithUpdate;
            // Now we've updated the message, it won't be updated again, so we can delete it from the tracking map.
            this.dataGridRowForId.delete(message.id);
            this.dataGridIntegrator.update({
                ...this.dataGridIntegrator.data(),
                rows: newRowsArray,
            });
            return;
        }
        const sdkTarget = target;
        const responseIcon = new IconButton.Icon.Icon();
        responseIcon.data = { iconName: 'ic_response', color: 'var(--color-text-disabled)', width: '16px', height: '16px' };
        const newRow = {
            cells: [
                { columnId: 'method', value: message.method, title: message.method },
                { columnId: 'request', value: '', renderer: DataGrid.DataGridRenderers.codeBlockRenderer },
                {
                    columnId: 'response',
                    value: JSON.stringify(message.params),
                    renderer: DataGrid.DataGridRenderers.codeBlockRenderer,
                },
                {
                    columnId: 'timestamp',
                    value: Date.now() - this.startTime,
                    renderer: timestampRenderer,
                },
                { columnId: 'type', value: responseIcon, title: 'received' },
                { columnId: 'target', value: this.targetToString(sdkTarget) },
                { columnId: 'session', value: message.sessionId || '' },
            ],
            hidden: false,
        };
        this.dataGridIntegrator.update({
            ...this.dataGridIntegrator.data(),
            rows: this.dataGridIntegrator.data().rows.concat([newRow]),
        });
    }
    messageSent(message, target) {
        if (this.isRecording) {
            this.messages.push({ ...message, type: 'send' });
        }
        const sdkTarget = target;
        const requestResponseIcon = new IconButton.Icon.Icon();
        requestResponseIcon
            .data = { iconName: 'ic_request_response', color: 'var(--color-primary)', width: '16px', height: '16px' };
        const newRow = {
            styles: {
                '--override-data-grid-row-background-color': 'var(--override-data-grid-sent-message-row-background-color)',
            },
            cells: [
                { columnId: 'method', value: message.method, title: message.method },
                {
                    columnId: 'request',
                    value: JSON.stringify(message.params),
                    renderer: DataGrid.DataGridRenderers.codeBlockRenderer,
                },
                { columnId: 'response', value: '(pending)', renderer: DataGrid.DataGridRenderers.codeBlockRenderer },
                {
                    columnId: 'timestamp',
                    value: Date.now() - this.startTime,
                    renderer: timestampRenderer,
                },
                { columnId: 'type', value: requestResponseIcon, title: 'sent' },
                { columnId: 'target', value: this.targetToString(sdkTarget) },
                { columnId: 'session', value: message.sessionId || '' },
            ],
            hidden: false,
        };
        this.dataGridRowForId.set(message.id, newRow);
        this.dataGridIntegrator.update({
            ...this.dataGridIntegrator.data(),
            rows: this.dataGridIntegrator.data().rows.concat([newRow]),
        });
    }
    async saveAsFile() {
        const now = new Date();
        const fileName = 'ProtocolMonitor-' + Platform.DateUtilities.toISO8601Compact(now) + '.json';
        const stream = new Bindings.FileUtils.FileOutputStream();
        const accepted = await stream.open(fileName);
        if (!accepted) {
            return;
        }
        void stream.write(JSON.stringify(this.messages, null, '  '));
        void stream.close();
    }
}
export class InfoWidget extends UI.Widget.VBox {
    tabbedPane;
    constructor() {
        super();
        this.tabbedPane = new UI.TabbedPane.TabbedPane();
        this.tabbedPane.appendTab('request', i18nString(UIStrings.request), new UI.Widget.Widget());
        this.tabbedPane.appendTab('response', i18nString(UIStrings.response), new UI.Widget.Widget());
        this.tabbedPane.show(this.contentElement);
        this.tabbedPane.selectTab('response');
        this.render(null);
    }
    render(data) {
        if (!data || !data.request || !data.response) {
            this.tabbedPane.changeTabView('request', new UI.EmptyWidget.EmptyWidget(i18nString(UIStrings.noMessageSelected)));
            this.tabbedPane.changeTabView('response', new UI.EmptyWidget.EmptyWidget(i18nString(UIStrings.noMessageSelected)));
            return;
        }
        const requestEnabled = data && data.type && data.type === 'sent';
        this.tabbedPane.setTabEnabled('request', Boolean(requestEnabled));
        if (!requestEnabled) {
            this.tabbedPane.selectTab('response');
        }
        const requestParsed = JSON.parse(String(data.request.value) || 'null');
        this.tabbedPane.changeTabView('request', SourceFrame.JSONView.JSONView.createViewSync(requestParsed));
        const responseParsed = data.response.value === '(pending)' ? null : JSON.parse(String(data.response.value) || 'null');
        this.tabbedPane.changeTabView('response', SourceFrame.JSONView.JSONView.createViewSync(responseParsed));
    }
}
//# sourceMappingURL=ProtocolMonitor.js.map