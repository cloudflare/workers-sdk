// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as DataGrid from '../../ui/legacy/components/data_grid/data_grid.js';
import * as UI from '../../ui/legacy/legacy.js';
const UIStrings = {
    /**
    *@description Text in Database Table View of the Application panel
    */
    database: 'Database',
    /**
    *@description Text to refresh the page
    */
    refresh: 'Refresh',
    /**
    *@description Text in Database Table View of the Application panel
    */
    visibleColumns: 'Visible columns',
    /**
    *@description Text in Database Table View of the Application panel
    *@example {database} PH1
    */
    theStableIsEmpty: 'The "{PH1}" table is empty.',
    /**
    *@description Error msg element text content in Database Table View of the Application panel
    *@example {database} PH1
    */
    anErrorOccurredTryingToreadTheS: 'An error occurred trying to read the "{PH1}" table.',
};
const str_ = i18n.i18n.registerUIStrings('panels/application/DatabaseTableView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class DatabaseTableView extends UI.View.SimpleView {
    database;
    tableName;
    lastVisibleColumns;
    columnsMap;
    visibleColumnsSetting;
    refreshButton;
    visibleColumnsInput;
    dataGrid;
    emptyWidget;
    constructor(database, tableName) {
        super(i18nString(UIStrings.database));
        this.database = database;
        this.tableName = tableName;
        this.lastVisibleColumns = '';
        this.columnsMap = new Map();
        this.element.classList.add('storage-view', 'table');
        this.visibleColumnsSetting =
            Common.Settings.Settings.instance().createSetting('databaseTableViewVisibleColumns', {});
        this.refreshButton = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.refresh), 'largeicon-refresh');
        this.refreshButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.refreshButtonClicked, this);
        this.visibleColumnsInput = new UI.Toolbar.ToolbarInput(i18nString(UIStrings.visibleColumns), '', 1);
        this.visibleColumnsInput.addEventListener(UI.Toolbar.ToolbarInput.Event.TextChanged, this.onVisibleColumnsChanged, this);
        this.dataGrid = null;
    }
    wasShown() {
        this.update();
    }
    async toolbarItems() {
        return [this.refreshButton, this.visibleColumnsInput];
    }
    escapeTableName(tableName) {
        return tableName.replace(/\"/g, '""');
    }
    update() {
        void this.database.executeSql('SELECT rowid, * FROM "' + this.escapeTableName(this.tableName) + '"', this.queryFinished.bind(this), this.queryError.bind(this));
    }
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFinished(columnNames, values) {
        this.detachChildWidgets();
        this.element.removeChildren();
        this.dataGrid =
            DataGrid.SortableDataGrid.SortableDataGrid.create(columnNames, values, i18nString(UIStrings.database));
        this.visibleColumnsInput.setVisible(Boolean(this.dataGrid));
        if (!this.dataGrid) {
            this.emptyWidget = new UI.EmptyWidget.EmptyWidget(i18nString(UIStrings.theStableIsEmpty, { PH1: this.tableName }));
            this.emptyWidget.show(this.element);
            return;
        }
        this.dataGrid.setStriped(true);
        this.dataGrid.asWidget().show(this.element);
        this.dataGrid.autoSizeColumns(5);
        this.columnsMap.clear();
        for (let i = 1; i < columnNames.length; ++i) {
            this.columnsMap.set(columnNames[i], String(i));
        }
        this.lastVisibleColumns = '';
        const visibleColumnsText = this.visibleColumnsSetting.get()[this.tableName] || '';
        this.visibleColumnsInput.setValue(visibleColumnsText);
        this.onVisibleColumnsChanged();
    }
    onVisibleColumnsChanged() {
        if (!this.dataGrid) {
            return;
        }
        const text = this.visibleColumnsInput.value();
        const parts = text.split(/[\s,]+/);
        const matches = new Set();
        const columnsVisibility = new Set();
        columnsVisibility.add('0');
        for (const part of parts) {
            const mappedColumn = this.columnsMap.get(part);
            if (mappedColumn !== undefined) {
                matches.add(part);
                columnsVisibility.add(mappedColumn);
            }
        }
        const newVisibleColumns = [...matches].sort().join(', ');
        if (newVisibleColumns.length === 0) {
            for (const v of this.columnsMap.values()) {
                columnsVisibility.add(v);
            }
        }
        if (newVisibleColumns === this.lastVisibleColumns) {
            return;
        }
        const visibleColumnsRegistry = this.visibleColumnsSetting.get();
        visibleColumnsRegistry[this.tableName] = text;
        this.visibleColumnsSetting.set(visibleColumnsRegistry);
        this.dataGrid.setColumnsVisiblity(columnsVisibility);
        this.lastVisibleColumns = newVisibleColumns;
    }
    queryError() {
        this.detachChildWidgets();
        this.element.removeChildren();
        const errorMsgElement = document.createElement('div');
        errorMsgElement.className = 'storage-table-error';
        errorMsgElement.textContent = i18nString(UIStrings.anErrorOccurredTryingToreadTheS, { PH1: this.tableName });
        this.element.appendChild(errorMsgElement);
    }
    refreshButtonClicked() {
        this.update();
    }
}
//# sourceMappingURL=DatabaseTableView.js.map