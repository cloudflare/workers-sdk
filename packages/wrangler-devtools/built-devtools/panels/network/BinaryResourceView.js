// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import binaryResourceViewStyles from './binaryResourceView.css.js';
import * as SourceFrame from '../../ui/legacy/components/source_frame/source_frame.js';
import * as UI from '../../ui/legacy/legacy.js';
const UIStrings = {
    /**
    * @description Text in Binary Resource View of the Network panel. Shown to the user as a status
    * message after the current text has been copied to the clipboard. Base64 is a format for encoding
    * data.
    */
    copiedAsBase: 'Copied as `Base64`',
    /**
    *@description Text in Binary Resource View of the Network panel
    */
    hexViewer: '`Hex` Viewer',
    /**
    * @description Text in Binary Resource View of the Network panel. Shown to the user as a status
    * message after the current text has been copied to the clipboard. Hex is short for hexadecimal,
    * and is a format for encoding data.
    */
    copiedAsHex: 'Copied as `Hex`',
    /**
    *@description Text in Binary Resource View of the Network panel. Shown to the user as a status
    * message after the current text has been copied to the clipboard. UTF-8 is a format for encoding data.
    */
    copiedAsUtf: 'Copied as `UTF-8`',
    /**
    *@description Screen reader label for a select box that chooses how to display binary data in the Network panel
    */
    binaryViewType: 'Binary view type',
    /**
    *@description Tooltip text that appears when hovering over the largeicon copy button in the Binary Resource View of the Network panel
    */
    copyToClipboard: 'Copy to clipboard',
    /**
    * @description A context menu command in the Binary Resource View of the Network panel, for
    * copying to the clipboard. Base64 is a format for encoding data.
    */
    copyAsBase: 'Copy as `Base64`',
    /**
    *@description A context menu command in the Binary Resource View of the Network panel, for copying
    * to the clipboard. Hex is short for hexadecimal, and is a format for encoding data.
    */
    copyAsHex: 'Copy as `Hex`',
    /**
    *@description A context menu command in the Binary Resource View of the Network panel, for copying
    *to the clipboard. UTF-8 is a format for encoding data.
    */
    copyAsUtf: 'Copy as `UTF-8`',
};
const str_ = i18n.i18n.registerUIStrings('panels/network/BinaryResourceView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class BinaryResourceView extends UI.Widget.VBox {
    binaryResourceViewFactory;
    toolbar;
    binaryViewObjects;
    binaryViewTypeSetting;
    binaryViewTypeCombobox;
    copiedText;
    addFadeoutSettimeoutId;
    lastView;
    constructor(base64content, contentUrl, resourceType) {
        super();
        this.binaryResourceViewFactory =
            new SourceFrame.BinaryResourceViewFactory.BinaryResourceViewFactory(base64content, contentUrl, resourceType);
        this.toolbar = new UI.Toolbar.Toolbar('binary-view-toolbar', this.element);
        this.binaryViewObjects = [
            new BinaryViewObject('base64', i18n.i18n.lockedString('Base64'), i18nString(UIStrings.copiedAsBase), this.binaryResourceViewFactory.createBase64View.bind(this.binaryResourceViewFactory), this.binaryResourceViewFactory.base64.bind(this.binaryResourceViewFactory)),
            new BinaryViewObject('hex', i18nString(UIStrings.hexViewer), i18nString(UIStrings.copiedAsHex), this.binaryResourceViewFactory.createHexView.bind(this.binaryResourceViewFactory), this.binaryResourceViewFactory.hex.bind(this.binaryResourceViewFactory)),
            new BinaryViewObject('utf8', i18n.i18n.lockedString('UTF-8'), i18nString(UIStrings.copiedAsUtf), this.binaryResourceViewFactory.createUtf8View.bind(this.binaryResourceViewFactory), this.binaryResourceViewFactory.utf8.bind(this.binaryResourceViewFactory)),
        ];
        this.binaryViewTypeSetting = Common.Settings.Settings.instance().createSetting('binaryViewType', 'hex');
        this.binaryViewTypeCombobox =
            new UI.Toolbar.ToolbarComboBox(this.binaryViewTypeChanged.bind(this), i18nString(UIStrings.binaryViewType));
        for (const viewObject of this.binaryViewObjects) {
            this.binaryViewTypeCombobox.addOption(this.binaryViewTypeCombobox.createOption(viewObject.label, viewObject.type));
        }
        this.toolbar.appendToolbarItem(this.binaryViewTypeCombobox);
        const copyButton = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.copyToClipboard), 'largeicon-copy');
        copyButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, _event => {
            void this.copySelectedViewToClipboard();
        }, this);
        this.toolbar.appendToolbarItem(copyButton);
        this.copiedText = new UI.Toolbar.ToolbarText();
        this.copiedText.element.classList.add('binary-view-copied-text');
        this.toolbar.element.appendChild(this.copiedText.element);
        this.addFadeoutSettimeoutId = null;
        this.lastView = null;
        this.updateView();
    }
    getCurrentViewObject() {
        const filter = (obj) => obj.type === this.binaryViewTypeSetting.get();
        const binaryViewObject = this.binaryViewObjects.find(filter);
        console.assert(Boolean(binaryViewObject), `No binary view found for binary view type found in setting 'binaryViewType': ${this.binaryViewTypeSetting.get()}`);
        return binaryViewObject || null;
    }
    async copySelectedViewToClipboard() {
        const viewObject = this.getCurrentViewObject();
        if (!viewObject) {
            return;
        }
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText((await viewObject.content()).content);
        this.copiedText.setText(viewObject.copiedMessage);
        this.copiedText.element.classList.remove('fadeout');
        function addFadeoutClass() {
            this.copiedText.element.classList.add('fadeout');
        }
        if (this.addFadeoutSettimeoutId) {
            clearTimeout(this.addFadeoutSettimeoutId);
            this.addFadeoutSettimeoutId = null;
        }
        this.addFadeoutSettimeoutId = window.setTimeout(addFadeoutClass.bind(this), 2000);
    }
    wasShown() {
        this.updateView();
        this.registerCSSFiles([binaryResourceViewStyles]);
    }
    updateView() {
        const newViewObject = this.getCurrentViewObject();
        if (!newViewObject) {
            return;
        }
        const newView = newViewObject.getView();
        if (newView === this.lastView) {
            return;
        }
        if (this.lastView) {
            this.lastView.detach();
        }
        this.lastView = newView;
        newView.show(this.element, this.toolbar.element);
        this.binaryViewTypeCombobox.selectElement().value = this.binaryViewTypeSetting.get();
    }
    binaryViewTypeChanged() {
        const selectedOption = this.binaryViewTypeCombobox.selectedOption();
        if (!selectedOption) {
            return;
        }
        const newViewType = selectedOption.value;
        if (this.binaryViewTypeSetting.get() === newViewType) {
            return;
        }
        this.binaryViewTypeSetting.set(newViewType);
        this.updateView();
    }
    addCopyToContextMenu(contextMenu, submenuItemText) {
        const copyMenu = contextMenu.clipboardSection().appendSubMenuItem(submenuItemText);
        const footerSection = copyMenu.footerSection();
        footerSection.appendItem(i18nString(UIStrings.copyAsBase), async () => {
            const content = await this.binaryResourceViewFactory.base64();
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(content.content);
        });
        footerSection.appendItem(i18nString(UIStrings.copyAsHex), async () => {
            const content = await this.binaryResourceViewFactory.hex();
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(content.content);
        });
        footerSection.appendItem(i18nString(UIStrings.copyAsUtf), async () => {
            const content = await this.binaryResourceViewFactory.utf8();
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(content.content);
        });
    }
}
export class BinaryViewObject {
    type;
    label;
    copiedMessage;
    content;
    createViewFn;
    view;
    constructor(type, label, copiedMessage, createViewFn, deferredContent) {
        this.type = type;
        this.label = label;
        this.copiedMessage = copiedMessage;
        this.content = deferredContent;
        this.createViewFn = createViewFn;
        this.view = null;
    }
    getView() {
        if (!this.view) {
            this.view = this.createViewFn();
        }
        return this.view;
    }
}
//# sourceMappingURL=BinaryResourceView.js.map