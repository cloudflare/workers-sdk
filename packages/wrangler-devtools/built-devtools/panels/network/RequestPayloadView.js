// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) IBM Corp. 2009  All rights reserved.
 * Copyright (C) 2010 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as ObjectUI from '../../ui/legacy/components/object_ui/object_ui.js';
// eslint-disable-next-line rulesdir/es_modules_import
import objectPropertiesSectionStyles from '../../ui/legacy/components/object_ui/objectPropertiesSection.css.js';
// eslint-disable-next-line rulesdir/es_modules_import
import objectValueStyles from '../../ui/legacy/components/object_ui/objectValue.css.js';
import * as UI from '../../ui/legacy/legacy.js';
import requestPayloadTreeStyles from './requestPayloadTree.css.js';
import requestPayloadViewStyles from './requestPayloadView.css.js';
const UIStrings = {
    /**
    *@description A context menu item in the Watch Expressions Sidebar Pane of the Sources panel and Network pane request.
    */
    copyValue: 'Copy value',
    /**
    * @description Text in Request Payload View of the Network panel. This is a noun-phrase meaning the
    * payload of a network request.
    */
    requestPayload: 'Request Payload',
    /**
    *@description Text in Request Payload View of the Network panel
    */
    unableToDecodeValue: '(unable to decode value)',
    /**
    *@description Text in Request Payload View of the Network panel
    */
    queryStringParameters: 'Query String Parameters',
    /**
    *@description Text in Request Payload View of the Network panel
    */
    formData: 'Form Data',
    /**
    *@description Text to show more content
    */
    showMore: 'Show more',
    /**
    *@description Text for toggling the view of payload data (e.g. query string parameters) from source to parsed in the payload tab
    */
    viewParsed: 'View parsed',
    /**
    *@description Text to show an item is empty
    */
    empty: '(empty)',
    /**
    *@description Text for toggling the view of payload data (e.g. query string parameters) from parsed to source in the payload tab
    */
    viewSource: 'View source',
    /**
    * @description Text for toggling payload data (e.g. query string parameters) from decoded to
    * encoded in the payload tab or in the cookies preview. URL-encoded is a different data format for
    * the same data, which the user sees when they click this command.
    */
    viewUrlEncoded: 'View URL-encoded',
    /**
    *@description Text for toggling payload data (e.g. query string parameters) from encoded to decoded in the payload tab or in the cookies preview
    */
    viewDecoded: 'View decoded',
    /**
    *@description Text for toggling payload data (e.g. query string parameters) from decoded to
    * encoded in the payload tab or in the cookies preview. URL-encoded is a different data format for
    * the same data, which the user sees when they click this command.
    */
    viewUrlEncodedL: 'view URL-encoded',
    /**
    *@description Text in Request Payload View of the Network panel
    */
    viewDecodedL: 'view decoded',
    /**
    *@description Text in Request Payload View of the Network panel
    */
    viewParsedL: 'view parsed',
    /**
    *@description Text in Request Payload View of the Network panel
    */
    viewSourceL: 'view source',
};
const str_ = i18n.i18n.registerUIStrings('panels/network/RequestPayloadView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class RequestPayloadView extends UI.Widget.VBox {
    request;
    decodeRequestParameters;
    queryStringCategory;
    formDataCategory;
    requestPayloadCategory;
    constructor(request) {
        super();
        this.element.classList.add('request-payload-view');
        this.request = request;
        this.decodeRequestParameters = true;
        const contentType = request.requestContentType();
        if (contentType) {
            this.decodeRequestParameters = Boolean(contentType.match(/^application\/x-www-form-urlencoded\s*(;.*)?$/i));
        }
        const root = new UI.TreeOutline.TreeOutlineInShadow();
        root.registerCSSFiles([objectValueStyles, objectPropertiesSectionStyles, requestPayloadTreeStyles]);
        root.element.classList.add('request-payload-tree');
        root.makeDense();
        this.element.appendChild(root.element);
        this.queryStringCategory = new Category(root, 'queryString', '');
        this.formDataCategory = new Category(root, 'formData', '');
        this.requestPayloadCategory = new Category(root, 'requestPayload', i18nString(UIStrings.requestPayload));
    }
    wasShown() {
        this.registerCSSFiles([requestPayloadViewStyles]);
        this.request.addEventListener(SDK.NetworkRequest.Events.RequestHeadersChanged, this.refreshFormData, this);
        this.refreshQueryString();
        void this.refreshFormData();
        // this._root.select(/* omitFocus */ true, /* selectedByUser */ false);
    }
    willHide() {
        this.request.removeEventListener(SDK.NetworkRequest.Events.RequestHeadersChanged, this.refreshFormData, this);
    }
    addEntryContextMenuHandler(treeElement, value) {
        treeElement.listItemElement.addEventListener('contextmenu', event => {
            event.consume(true);
            const contextMenu = new UI.ContextMenu.ContextMenu(event);
            const decodedValue = decodeURIComponent(value);
            const copyDecodedValueHandler = () => {
                Host.userMetrics.actionTaken(Host.UserMetrics.Action.NetworkPanelCopyValue);
                Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(decodedValue);
            };
            contextMenu.clipboardSection().appendItem(i18nString(UIStrings.copyValue), copyDecodedValueHandler);
            void contextMenu.show();
        });
    }
    formatParameter(value, className, decodeParameters) {
        let errorDecoding = false;
        if (decodeParameters) {
            value = value.replace(/\+/g, ' ');
            if (value.indexOf('%') >= 0) {
                try {
                    value = decodeURIComponent(value);
                }
                catch (e) {
                    errorDecoding = true;
                }
            }
        }
        const div = document.createElement('div');
        if (className) {
            div.className = className;
        }
        if (value === '') {
            div.classList.add('empty-value');
        }
        if (errorDecoding) {
            div.createChild('span', 'payload-decode-error').textContent = i18nString(UIStrings.unableToDecodeValue);
        }
        else {
            div.textContent = value;
        }
        return div;
    }
    refreshQueryString() {
        const queryString = this.request.queryString();
        const queryParameters = this.request.queryParameters;
        this.queryStringCategory.hidden = !queryParameters;
        if (queryParameters) {
            this.refreshParams(i18nString(UIStrings.queryStringParameters), queryParameters, queryString, this.queryStringCategory);
        }
    }
    async refreshFormData() {
        const formData = await this.request.requestFormData();
        if (!formData) {
            this.formDataCategory.hidden = true;
            this.requestPayloadCategory.hidden = true;
            return;
        }
        const formParameters = await this.request.formParameters();
        if (formParameters) {
            this.formDataCategory.hidden = false;
            this.requestPayloadCategory.hidden = true;
            this.refreshParams(i18nString(UIStrings.formData), formParameters, formData, this.formDataCategory);
        }
        else {
            this.requestPayloadCategory.hidden = false;
            this.formDataCategory.hidden = true;
            try {
                const json = JSON.parse(formData);
                this.refreshRequestJSONPayload(json, formData);
            }
            catch (e) {
                this.populateTreeElementWithSourceText(this.requestPayloadCategory, formData);
            }
        }
    }
    populateTreeElementWithSourceText(treeElement, sourceText) {
        // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const max_len = 3000;
        const text = (sourceText || '').trim();
        const trim = text.length > max_len;
        const sourceTextElement = document.createElement('span');
        sourceTextElement.classList.add('payload-value');
        sourceTextElement.classList.add('source-code');
        sourceTextElement.textContent = trim ? text.substr(0, max_len) : text;
        const sourceTreeElement = new UI.TreeOutline.TreeElement(sourceTextElement);
        treeElement.removeChildren();
        treeElement.appendChild(sourceTreeElement);
        if (!trim) {
            return;
        }
        const showMoreButton = document.createElement('button');
        showMoreButton.classList.add('request-payload-show-more-button');
        showMoreButton.textContent = i18nString(UIStrings.showMore);
        function showMore() {
            showMoreButton.remove();
            sourceTextElement.textContent = text;
            sourceTreeElement.listItemElement.removeEventListener('contextmenu', onContextMenuShowMore);
        }
        showMoreButton.addEventListener('click', showMore);
        function onContextMenuShowMore(event) {
            const contextMenu = new UI.ContextMenu.ContextMenu(event);
            const section = contextMenu.newSection();
            section.appendItem(i18nString(UIStrings.showMore), showMore);
            void contextMenu.show();
        }
        sourceTreeElement.listItemElement.addEventListener('contextmenu', onContextMenuShowMore);
        sourceTextElement.appendChild(showMoreButton);
    }
    refreshParams(title, params, sourceText, paramsTreeElement) {
        paramsTreeElement.removeChildren();
        paramsTreeElement.listItemElement.removeChildren();
        paramsTreeElement.listItemElement.createChild('div', 'selection fill');
        UI.UIUtils.createTextChild(paramsTreeElement.listItemElement, title);
        const payloadCount = document.createElement('span');
        payloadCount.classList.add('payload-count');
        const numberOfParams = params ? params.length : 0;
        payloadCount.textContent = `\xA0(${numberOfParams})`;
        paramsTreeElement.listItemElement.appendChild(payloadCount);
        const shouldViewSource = viewSourceForItems.has(paramsTreeElement);
        if (shouldViewSource) {
            this.appendParamsSource(title, params, sourceText, paramsTreeElement);
        }
        else {
            this.appendParamsParsed(title, params, sourceText, paramsTreeElement);
        }
    }
    appendParamsSource(title, params, sourceText, paramsTreeElement) {
        this.populateTreeElementWithSourceText(paramsTreeElement, sourceText);
        const listItemElement = paramsTreeElement.listItemElement;
        const viewParsed = function (event) {
            listItemElement.removeEventListener('contextmenu', viewParsedContextMenu);
            viewSourceForItems.delete(paramsTreeElement);
            this.refreshParams(title, params, sourceText, paramsTreeElement);
            event.consume();
        };
        const viewParsedContextMenu = (event) => {
            if (!paramsTreeElement.expanded) {
                return;
            }
            const contextMenu = new UI.ContextMenu.ContextMenu(event);
            contextMenu.newSection().appendItem(i18nString(UIStrings.viewParsed), viewParsed.bind(this, event));
            void contextMenu.show();
        };
        const viewParsedButton = this.createViewSourceToggle(/* viewSource */ true, viewParsed.bind(this));
        listItemElement.appendChild(viewParsedButton);
        listItemElement.addEventListener('contextmenu', viewParsedContextMenu);
    }
    appendParamsParsed(title, params, sourceText, paramsTreeElement) {
        for (const param of params || []) {
            const paramNameValue = document.createDocumentFragment();
            if (param.name !== '') {
                const name = this.formatParameter(param.name + ': ', 'payload-name', this.decodeRequestParameters);
                const value = this.formatParameter(param.value, 'payload-value source-code', this.decodeRequestParameters);
                paramNameValue.appendChild(name);
                paramNameValue.createChild('span', 'payload-separator');
                paramNameValue.appendChild(value);
            }
            else {
                paramNameValue.appendChild(this.formatParameter(i18nString(UIStrings.empty), 'empty-request-payload', this.decodeRequestParameters));
            }
            const paramTreeElement = new UI.TreeOutline.TreeElement(paramNameValue);
            this.addEntryContextMenuHandler(paramTreeElement, param.value);
            paramsTreeElement.appendChild(paramTreeElement);
        }
        const listItemElement = paramsTreeElement.listItemElement;
        const viewSource = function (event) {
            listItemElement.removeEventListener('contextmenu', viewSourceContextMenu);
            viewSourceForItems.add(paramsTreeElement);
            this.refreshParams(title, params, sourceText, paramsTreeElement);
            event.consume();
        };
        const toggleURLDecoding = function (event) {
            listItemElement.removeEventListener('contextmenu', viewSourceContextMenu);
            this.toggleURLDecoding(event);
        };
        const viewSourceContextMenu = (event) => {
            if (!paramsTreeElement.expanded) {
                return;
            }
            const contextMenu = new UI.ContextMenu.ContextMenu(event);
            const section = contextMenu.newSection();
            section.appendItem(i18nString(UIStrings.viewSource), viewSource.bind(this, event));
            const viewURLEncodedText = this.decodeRequestParameters ? i18nString(UIStrings.viewUrlEncoded) : i18nString(UIStrings.viewDecoded);
            section.appendItem(viewURLEncodedText, toggleURLDecoding.bind(this, event));
            void contextMenu.show();
        };
        const viewSourceButton = this.createViewSourceToggle(/* viewSource */ false, viewSource.bind(this));
        listItemElement.appendChild(viewSourceButton);
        const toggleTitle = this.decodeRequestParameters ? i18nString(UIStrings.viewUrlEncodedL) : i18nString(UIStrings.viewDecodedL);
        const toggleButton = this.createToggleButton(toggleTitle);
        toggleButton.addEventListener('click', toggleURLDecoding.bind(this), false);
        listItemElement.appendChild(toggleButton);
        listItemElement.addEventListener('contextmenu', viewSourceContextMenu);
    }
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    refreshRequestJSONPayload(parsedObject, sourceText) {
        const rootListItem = this.requestPayloadCategory;
        rootListItem.removeChildren();
        const rootListItemElement = rootListItem.listItemElement;
        rootListItemElement.removeChildren();
        rootListItemElement.createChild('div', 'selection fill');
        UI.UIUtils.createTextChild(rootListItemElement, this.requestPayloadCategory.title.toString());
        if (viewSourceForItems.has(rootListItem)) {
            this.appendJSONPayloadSource(rootListItem, parsedObject, sourceText);
        }
        else {
            this.appendJSONPayloadParsed(rootListItem, parsedObject, sourceText);
        }
    }
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appendJSONPayloadSource(rootListItem, parsedObject, sourceText) {
        const rootListItemElement = rootListItem.listItemElement;
        this.populateTreeElementWithSourceText(rootListItem, sourceText);
        const viewParsed = function (event) {
            rootListItemElement.removeEventListener('contextmenu', viewParsedContextMenu);
            viewSourceForItems.delete(rootListItem);
            this.refreshRequestJSONPayload(parsedObject, sourceText);
            event.consume();
        };
        const viewParsedButton = this.createViewSourceToggle(/* viewSource */ true, viewParsed.bind(this));
        rootListItemElement.appendChild(viewParsedButton);
        const viewParsedContextMenu = (event) => {
            if (!rootListItem.expanded) {
                return;
            }
            const contextMenu = new UI.ContextMenu.ContextMenu(event);
            contextMenu.newSection().appendItem(i18nString(UIStrings.viewParsed), viewParsed.bind(this, event));
            void contextMenu.show();
        };
        rootListItemElement.addEventListener('contextmenu', viewParsedContextMenu);
    }
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appendJSONPayloadParsed(rootListItem, parsedObject, sourceText) {
        const object = SDK.RemoteObject.RemoteObject.fromLocalObject(parsedObject);
        const section = new ObjectUI.ObjectPropertiesSection.RootElement(object);
        section.title = object.description;
        section.expand();
        // `editable` is not a valid property for `ObjectUI.ObjectPropertiesSection.RootElement`. Only for
        // `ObjectUI.ObjectPropertiesSection.ObjectPropertiesSection`. We do not know if this assignment is
        // safe to delete.
        // @ts-ignore
        section.editable = false;
        rootListItem.childrenListElement.classList.add('source-code', 'object-properties-section');
        rootListItem.appendChild(section);
        const rootListItemElement = rootListItem.listItemElement;
        const viewSource = function (event) {
            rootListItemElement.removeEventListener('contextmenu', viewSourceContextMenu);
            viewSourceForItems.add(rootListItem);
            this.refreshRequestJSONPayload(parsedObject, sourceText);
            event.consume();
        };
        const viewSourceContextMenu = (event) => {
            if (!rootListItem.expanded) {
                return;
            }
            const contextMenu = new UI.ContextMenu.ContextMenu(event);
            contextMenu.newSection().appendItem(i18nString(UIStrings.viewSource), viewSource.bind(this, event));
            void contextMenu.show();
        };
        const viewSourceButton = this.createViewSourceToggle(/* viewSource */ false, viewSource.bind(this));
        rootListItemElement.appendChild(viewSourceButton);
        rootListItemElement.addEventListener('contextmenu', viewSourceContextMenu);
    }
    createViewSourceToggle(viewSource, handler) {
        const viewSourceToggleTitle = viewSource ? i18nString(UIStrings.viewParsedL) : i18nString(UIStrings.viewSourceL);
        const viewSourceToggleButton = this.createToggleButton(viewSourceToggleTitle);
        viewSourceToggleButton.addEventListener('click', handler, false);
        return viewSourceToggleButton;
    }
    toggleURLDecoding(event) {
        this.decodeRequestParameters = !this.decodeRequestParameters;
        this.refreshQueryString();
        void this.refreshFormData();
        event.consume();
    }
    createToggleButton(title) {
        const button = document.createElement('span');
        button.classList.add('payload-toggle');
        button.tabIndex = 0;
        button.setAttribute('role', 'button');
        button.textContent = title;
        return button;
    }
}
const viewSourceForItems = new WeakSet();
export class Category extends UI.TreeOutline.TreeElement {
    toggleOnClick;
    expandedSetting;
    expanded;
    constructor(root, name, title) {
        super(title || '', true);
        this.toggleOnClick = true;
        this.hidden = true;
        this.expandedSetting =
            Common.Settings.Settings.instance().createSetting('request-info-' + name + '-category-expanded', true);
        this.expanded = this.expandedSetting.get();
        root.appendChild(this);
    }
    createLeaf() {
        const leaf = new UI.TreeOutline.TreeElement();
        this.appendChild(leaf);
        return leaf;
    }
    onexpand() {
        this.expandedSetting.set(true);
    }
    oncollapse() {
        this.expandedSetting.set(false);
    }
}
//# sourceMappingURL=RequestPayloadView.js.map