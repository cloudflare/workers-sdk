// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
 * Copyright (C) 2008 Nokia Inc.  All rights reserved.
 * Copyright (C) 2013 Samsung Electronics. All rights reserved.
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
 * THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY
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
import * as TextUtils from '../../models/text_utils/text_utils.js';
import * as DataGrid from '../../ui/legacy/components/data_grid/data_grid.js';
import * as SourceFrame from '../../ui/legacy/components/source_frame/source_frame.js';
import * as UI from '../../ui/legacy/legacy.js';
import { DOMStorage } from './DOMStorageModel.js';
import { StorageItemsView } from './StorageItemsView.js';
const UIStrings = {
    /**
    *@description Text in DOMStorage Items View of the Application panel
    */
    domStorage: 'DOM Storage',
    /**
    *@description Text in DOMStorage Items View of the Application panel
    */
    key: 'Key',
    /**
    *@description Text for the value of something
    */
    value: 'Value',
    /**
    *@description Name for the "DOM Storage Items" table that shows the content of the DOM Storage.
    */
    domStorageItems: 'DOM Storage Items',
    /**
     *@description Text for announcing that the "DOM Storage Items" table was cleared, that is, all
     * entries were deleted.
     */
    domStorageItemsCleared: 'DOM Storage Items cleared',
    /**
    *@description Text in DOMStorage Items View of the Application panel
    */
    selectAValueToPreview: 'Select a value to preview',
    /**
     *@description Text for announcing a DOM Storage key/value item has been deleted
     */
    domStorageItemDeleted: 'The storage item was deleted.',
    /**
     *@description Text for announcing number of entries after filtering
     *@example {5} PH1
     */
    domStorageNumberEntries: 'Number of entries shown in table: {PH1}',
};
const str_ = i18n.i18n.registerUIStrings('panels/application/DOMStorageItemsView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class DOMStorageItemsView extends StorageItemsView {
    domStorage;
    dataGrid;
    splitWidget;
    previewPanel;
    preview;
    previewValue;
    eventListeners;
    constructor(domStorage) {
        super(i18nString(UIStrings.domStorage), 'domStoragePanel');
        this.domStorage = domStorage;
        this.element.classList.add('storage-view', 'table');
        const columns = [
            { id: 'key', title: i18nString(UIStrings.key), sortable: false, editable: true, longText: true, weight: 50 },
            { id: 'value', title: i18nString(UIStrings.value), sortable: false, editable: true, longText: true, weight: 50 },
        ];
        this.dataGrid = new DataGrid.DataGrid.DataGridImpl({
            displayName: i18nString(UIStrings.domStorageItems),
            columns,
            editCallback: this.editingCallback.bind(this),
            deleteCallback: this.deleteCallback.bind(this),
            refreshCallback: this.refreshItems.bind(this),
        });
        this.dataGrid.addEventListener(DataGrid.DataGrid.Events.SelectedNode, event => {
            void this.previewEntry(event.data);
        });
        this.dataGrid.addEventListener(DataGrid.DataGrid.Events.DeselectedNode, () => {
            void this.previewEntry(null);
        });
        this.dataGrid.setStriped(true);
        this.dataGrid.setName('DOMStorageItemsView');
        this.splitWidget = new UI.SplitWidget.SplitWidget(
        /* isVertical: */ false, /* secondIsSidebar: */ true, 'domStorageSplitViewState');
        this.splitWidget.show(this.element);
        this.previewPanel = new UI.Widget.VBox();
        this.previewPanel.setMinimumSize(0, 50);
        const resizer = this.previewPanel.element.createChild('div', 'preview-panel-resizer');
        const dataGridWidget = this.dataGrid.asWidget();
        dataGridWidget.setMinimumSize(0, 50);
        this.splitWidget.setMainWidget(dataGridWidget);
        this.splitWidget.setSidebarWidget(this.previewPanel);
        this.splitWidget.installResizer(resizer);
        this.preview = null;
        this.previewValue = null;
        this.showPreview(null, null);
        this.eventListeners = [];
        this.setStorage(domStorage);
    }
    setStorage(domStorage) {
        Common.EventTarget.removeEventListeners(this.eventListeners);
        this.domStorage = domStorage;
        this.eventListeners = [
            this.domStorage.addEventListener(DOMStorage.Events.DOMStorageItemsCleared, this.domStorageItemsCleared, this),
            this.domStorage.addEventListener(DOMStorage.Events.DOMStorageItemRemoved, this.domStorageItemRemoved, this),
            this.domStorage.addEventListener(DOMStorage.Events.DOMStorageItemAdded, this.domStorageItemAdded, this),
            this.domStorage.addEventListener(DOMStorage.Events.DOMStorageItemUpdated, this.domStorageItemUpdated, this),
        ];
        this.refreshItems();
    }
    domStorageItemsCleared() {
        if (!this.isShowing() || !this.dataGrid) {
            return;
        }
        this.dataGrid.rootNode().removeChildren();
        this.dataGrid.addCreationNode(false);
        UI.ARIAUtils.alert(i18nString(UIStrings.domStorageItemsCleared));
        this.setCanDeleteSelected(false);
    }
    domStorageItemRemoved(event) {
        if (!this.isShowing() || !this.dataGrid) {
            return;
        }
        const storageData = event.data;
        const rootNode = this.dataGrid.rootNode();
        const children = rootNode.children;
        for (let i = 0; i < children.length; ++i) {
            const childNode = children[i];
            if (childNode.data.key === storageData.key) {
                rootNode.removeChild(childNode);
                this.setCanDeleteSelected(children.length > 1);
                return;
            }
        }
    }
    domStorageItemAdded(event) {
        if (!this.isShowing() || !this.dataGrid) {
            return;
        }
        const storageData = event.data;
        const rootNode = this.dataGrid.rootNode();
        const children = rootNode.children;
        for (let i = 0; i < children.length; ++i) {
            if (children[i].data.key === storageData.key) {
                return;
            }
        }
        const childNode = new DataGrid.DataGrid.DataGridNode({ key: storageData.key, value: storageData.value }, false);
        rootNode.insertChild(childNode, children.length - 1);
    }
    domStorageItemUpdated(event) {
        if (!this.isShowing() || !this.dataGrid) {
            return;
        }
        const storageData = event.data;
        const childNode = this.dataGrid.rootNode().children.find((child) => child.data.key === storageData.key);
        if (!childNode || childNode.data.value === storageData.value) {
            return;
        }
        childNode.data.value = storageData.value;
        childNode.refresh();
        if (!childNode.selected) {
            return;
        }
        void this.previewEntry(childNode);
        this.setCanDeleteSelected(true);
    }
    showDOMStorageItems(items) {
        const rootNode = this.dataGrid.rootNode();
        let selectedKey = null;
        for (const node of rootNode.children) {
            if (!node.selected) {
                continue;
            }
            selectedKey = node.data.key;
            break;
        }
        rootNode.removeChildren();
        let selectedNode = null;
        const filteredItems = (item) => `${item[0]} ${item[1]}`;
        const filteredList = this.filter(items, filteredItems);
        for (const item of filteredList) {
            const key = item[0];
            const value = item[1];
            const node = new DataGrid.DataGrid.DataGridNode({ key: key, value: value }, false);
            node.selectable = true;
            rootNode.appendChild(node);
            if (!selectedNode || key === selectedKey) {
                selectedNode = node;
            }
        }
        if (selectedNode) {
            selectedNode.selected = true;
        }
        this.dataGrid.addCreationNode(false);
        this.setCanDeleteSelected(Boolean(selectedNode));
        UI.ARIAUtils.alert(i18nString(UIStrings.domStorageNumberEntries, { PH1: filteredList.length }));
    }
    deleteSelectedItem() {
        if (!this.dataGrid || !this.dataGrid.selectedNode) {
            return;
        }
        this.deleteCallback(this.dataGrid.selectedNode);
    }
    refreshItems() {
        void this.domStorage.getItems().then(items => items && this.showDOMStorageItems(items));
    }
    deleteAllItems() {
        this.domStorage.clear();
        // explicitly clear the view because the event won't be fired when it has no items
        this.domStorageItemsCleared();
    }
    editingCallback(editingNode, columnIdentifier, oldText, newText) {
        const domStorage = this.domStorage;
        if (columnIdentifier === 'key') {
            if (typeof oldText === 'string') {
                domStorage.removeItem(oldText);
            }
            domStorage.setItem(newText, editingNode.data.value || '');
            this.removeDupes(editingNode);
        }
        else {
            domStorage.setItem(editingNode.data.key || '', newText);
        }
    }
    removeDupes(masterNode) {
        const rootNode = this.dataGrid.rootNode();
        const children = rootNode.children;
        for (let i = children.length - 1; i >= 0; --i) {
            const childNode = children[i];
            if ((childNode.data.key === masterNode.data.key) && (masterNode !== childNode)) {
                rootNode.removeChild(childNode);
            }
        }
    }
    deleteCallback(node) {
        if (!node || node.isCreationNode) {
            return;
        }
        if (this.domStorage) {
            this.domStorage.removeItem(node.data.key);
        }
        UI.ARIAUtils.alert(i18nString(UIStrings.domStorageItemDeleted));
    }
    showPreview(preview, value) {
        if (this.preview && this.previewValue === value) {
            return;
        }
        if (this.preview) {
            this.preview.detach();
        }
        if (!preview) {
            preview = new UI.EmptyWidget.EmptyWidget(i18nString(UIStrings.selectAValueToPreview));
        }
        this.previewValue = value;
        this.preview = preview;
        preview.show(this.previewPanel.contentElement);
    }
    async previewEntry(entry) {
        const value = entry && entry.data && entry.data.value;
        if (entry && entry.data && entry.data.value) {
            const protocol = this.domStorage.isLocalStorage ? 'localstorage' : 'sessionstorage';
            const url = `${protocol}://${entry.key}`;
            const provider = TextUtils.StaticContentProvider.StaticContentProvider.fromString(url, Common.ResourceType.resourceTypes.XHR, value);
            const preview = await SourceFrame.PreviewFactory.PreviewFactory.createPreview(provider, 'text/plain');
            // Selection could've changed while the preview was loaded
            if (entry.selected) {
                this.showPreview(preview, value);
            }
        }
        else {
            this.showPreview(null, value);
        }
    }
}
//# sourceMappingURL=DOMStorageItemsView.js.map