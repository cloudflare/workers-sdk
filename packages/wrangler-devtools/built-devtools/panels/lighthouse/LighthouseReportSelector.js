// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as UI from '../../ui/legacy/legacy.js';
const UIStrings = {
    /**
    *@description Title of combo box in audits report selector
    */
    reports: 'Reports',
    /**
    *@description New report item label in Lighthouse Report Selector
    */
    newReport: '(new report)',
};
const str_ = i18n.i18n.registerUIStrings('panels/lighthouse/LighthouseReportSelector.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class ReportSelector {
    renderNewLighthouseView;
    newLighthouseItem;
    comboBoxInternal;
    itemByOptionElement;
    constructor(renderNewLighthouseView) {
        this.renderNewLighthouseView = renderNewLighthouseView;
        this.newLighthouseItem = document.createElement('option');
        this.comboBoxInternal = new UI.Toolbar.ToolbarComboBox(this.handleChange.bind(this), i18nString(UIStrings.reports), 'lighthouse-report');
        this.comboBoxInternal.setMaxWidth(180);
        this.comboBoxInternal.setMinWidth(140);
        this.itemByOptionElement = new Map();
        this.setEmptyState();
    }
    setEmptyState() {
        this.comboBoxInternal.selectElement().removeChildren();
        this.comboBoxInternal.setEnabled(false);
        this.newLighthouseItem = document.createElement('option');
        this.newLighthouseItem.label = i18nString(UIStrings.newReport);
        this.comboBoxInternal.selectElement().appendChild(this.newLighthouseItem);
        this.comboBoxInternal.select(this.newLighthouseItem);
    }
    handleChange(_event) {
        const item = this.selectedItem();
        if (item) {
            item.select();
        }
        else {
            this.renderNewLighthouseView();
        }
    }
    selectedItem() {
        const option = this.comboBoxInternal.selectedOption();
        return this.itemByOptionElement.get(option);
    }
    hasCurrentSelection() {
        return Boolean(this.selectedItem());
    }
    hasItems() {
        return this.itemByOptionElement.size > 0;
    }
    comboBox() {
        return this.comboBoxInternal;
    }
    prepend(item) {
        const optionEl = item.optionElement();
        const selectEl = this.comboBoxInternal.selectElement();
        this.itemByOptionElement.set(optionEl, item);
        selectEl.insertBefore(optionEl, selectEl.firstElementChild);
        this.comboBoxInternal.setEnabled(true);
        this.comboBoxInternal.select(optionEl);
        item.select();
    }
    clearAll() {
        for (const elem of this.comboBoxInternal.options()) {
            if (elem === this.newLighthouseItem) {
                continue;
            }
            this.itemByOptionElement.get(elem)?.delete();
            this.itemByOptionElement.delete(elem);
        }
        this.setEmptyState();
    }
    selectNewReport() {
        this.comboBoxInternal.select(this.newLighthouseItem);
    }
}
export class Item {
    lighthouseResult;
    renderReport;
    showLandingCallback;
    element;
    constructor(lighthouseResult, renderReport, showLandingCallback) {
        this.lighthouseResult = lighthouseResult;
        this.renderReport = renderReport;
        this.showLandingCallback = showLandingCallback;
        const url = new Common.ParsedURL.ParsedURL(lighthouseResult.finalUrl);
        const timestamp = lighthouseResult.fetchTime;
        this.element = document.createElement('option');
        this.element.label = `${new Date(timestamp).toLocaleTimeString()} - ${url.domain()}`;
    }
    select() {
        this.renderReport();
    }
    optionElement() {
        return this.element;
    }
    delete() {
        if (this.element) {
            this.element.remove();
        }
        this.showLandingCallback();
    }
}
//# sourceMappingURL=LighthouseReportSelector.js.map