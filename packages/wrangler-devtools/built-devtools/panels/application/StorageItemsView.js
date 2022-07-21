// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as UI from '../../ui/legacy/legacy.js';
const UIStrings = {
    /**
    *@description Text to refresh the page
    */
    refresh: 'Refresh',
    /**
    *@description Text to filter result items
    */
    filter: 'Filter',
    /**
    *@description Text to clear everything
    */
    clearAll: 'Clear All',
    /**
    *@description Tooltip text that appears when hovering over the largeicon delete button in the Service Worker Cache Views of the Application panel
    */
    deleteSelected: 'Delete Selected',
    /**
     *@description Text that informs screen reader users that the storage table has been refreshed
     */
    refreshedStatus: 'Table refreshed',
};
const str_ = i18n.i18n.registerUIStrings('panels/application/StorageItemsView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class StorageItemsView extends UI.Widget.VBox {
    filterRegex;
    refreshButton;
    mainToolbar;
    filterItem;
    deleteAllButton;
    deleteSelectedButton;
    constructor(_title, _filterName) {
        super(false);
        this.filterRegex = null;
        this.refreshButton = this.addButton(i18nString(UIStrings.refresh), 'largeicon-refresh', () => {
            this.refreshItems();
            UI.ARIAUtils.alert(i18nString(UIStrings.refreshedStatus));
        });
        this.mainToolbar = new UI.Toolbar.Toolbar('top-resources-toolbar', this.element);
        this.filterItem = new UI.Toolbar.ToolbarInput(i18nString(UIStrings.filter), '', 0.4);
        this.filterItem.addEventListener(UI.Toolbar.ToolbarInput.Event.TextChanged, this.filterChanged, this);
        const toolbarSeparator = new UI.Toolbar.ToolbarSeparator();
        this.deleteAllButton = this.addButton(i18nString(UIStrings.clearAll), 'largeicon-clear', this.deleteAllItems);
        this.deleteSelectedButton =
            this.addButton(i18nString(UIStrings.deleteSelected), 'largeicon-delete', this.deleteSelectedItem);
        this.deleteAllButton.element.id = 'storage-items-delete-all';
        const toolbarItems = [this.refreshButton, this.filterItem, toolbarSeparator, this.deleteAllButton, this.deleteSelectedButton];
        for (const item of toolbarItems) {
            this.mainToolbar.appendToolbarItem(item);
        }
    }
    setDeleteAllTitle(title) {
        this.deleteAllButton.setTitle(title);
    }
    setDeleteAllGlyph(glyph) {
        this.deleteAllButton.setGlyph(glyph);
    }
    appendToolbarItem(item) {
        this.mainToolbar.appendToolbarItem(item);
    }
    addButton(label, glyph, callback) {
        const button = new UI.Toolbar.ToolbarButton(label, glyph);
        button.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, callback, this);
        return button;
    }
    filterChanged({ data: text }) {
        this.filterRegex = text ? new RegExp(Platform.StringUtilities.escapeForRegExp(text), 'i') : null;
        this.refreshItems();
    }
    filter(items, keyFunction) {
        if (this.filterRegex) {
            const regExp = this.filterRegex;
            return items.filter(item => regExp.test(keyFunction(item)));
        }
        return items;
    }
    hasFilter() {
        return Boolean(this.filterRegex);
    }
    wasShown() {
        this.refreshItems();
    }
    setCanDeleteAll(enabled) {
        this.deleteAllButton.setEnabled(enabled);
    }
    setCanDeleteSelected(enabled) {
        this.deleteSelectedButton.setEnabled(enabled);
    }
    setCanRefresh(enabled) {
        this.refreshButton.setEnabled(enabled);
    }
    setCanFilter(enabled) {
        this.filterItem.setEnabled(enabled);
    }
    deleteAllItems() {
    }
    deleteSelectedItem() {
    }
    refreshItems() {
    }
}
//# sourceMappingURL=StorageItemsView.js.map