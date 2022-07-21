/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import { ExtensionNotifierView, ExtensionView } from './ExtensionView.js';
export class ExtensionPanel extends UI.Panel.Panel {
    server;
    id;
    panelToolbar;
    searchableViewInternal;
    constructor(server, panelName, id, pageURL) {
        super(panelName);
        this.server = server;
        this.id = id;
        this.setHideOnDetach();
        this.panelToolbar = new UI.Toolbar.Toolbar('hidden', this.element);
        this.searchableViewInternal = new UI.SearchableView.SearchableView(this, null);
        this.searchableViewInternal.show(this.element);
        const extensionView = new ExtensionView(server, this.id, pageURL, 'extension');
        extensionView.show(this.searchableViewInternal.element);
    }
    addToolbarItem(item) {
        this.panelToolbar.element.classList.remove('hidden');
        this.panelToolbar.appendToolbarItem(item);
    }
    searchCanceled() {
        this.server.notifySearchAction(this.id, "cancelSearch" /* CancelSearch */);
        this.searchableViewInternal.updateSearchMatchesCount(0);
    }
    searchableView() {
        return this.searchableViewInternal;
    }
    performSearch(searchConfig, _shouldJump, _jumpBackwards) {
        const query = searchConfig.query;
        this.server.notifySearchAction(this.id, "performSearch" /* PerformSearch */, query);
    }
    jumpToNextSearchResult() {
        this.server.notifySearchAction(this.id, "nextSearchResult" /* NextSearchResult */);
    }
    jumpToPreviousSearchResult() {
        this.server.notifySearchAction(this.id, "previousSearchResult" /* PreviousSearchResult */);
    }
    supportsCaseSensitiveSearch() {
        return false;
    }
    supportsRegexSearch() {
        return false;
    }
}
export class ExtensionButton {
    id;
    toolbarButtonInternal;
    constructor(server, id, iconURL, tooltip, disabled) {
        this.id = id;
        this.toolbarButtonInternal = new UI.Toolbar.ToolbarButton('', '');
        this.toolbarButtonInternal.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, server.notifyButtonClicked.bind(server, this.id));
        this.update(iconURL, tooltip, disabled);
    }
    update(iconURL, tooltip, disabled) {
        if (typeof iconURL === 'string') {
            this.toolbarButtonInternal.setBackgroundImage(iconURL);
        }
        if (typeof tooltip === 'string') {
            this.toolbarButtonInternal.setTitle(tooltip);
        }
        if (typeof disabled === 'boolean') {
            this.toolbarButtonInternal.setEnabled(!disabled);
        }
    }
    toolbarButton() {
        return this.toolbarButtonInternal;
    }
}
export class ExtensionSidebarPane extends UI.View.SimpleView {
    panelNameInternal;
    server;
    idInternal;
    extensionView;
    objectPropertiesView;
    constructor(server, panelName, title, id) {
        super(title);
        this.element.classList.add('fill');
        this.panelNameInternal = panelName;
        this.server = server;
        this.idInternal = id;
    }
    id() {
        return this.idInternal;
    }
    panelName() {
        return this.panelNameInternal;
    }
    setObject(object, title, callback) {
        this.createObjectPropertiesView();
        this.setObjectInternal(SDK.RemoteObject.RemoteObject.fromLocalObject(object), title, callback);
    }
    setExpression(expression, title, evaluateOptions, securityOrigin, callback) {
        this.createObjectPropertiesView();
        this.server.evaluate(expression, true, false, evaluateOptions, securityOrigin, this.onEvaluate.bind(this, title, callback));
    }
    setPage(url) {
        if (this.objectPropertiesView) {
            this.objectPropertiesView.detach();
            delete this.objectPropertiesView;
        }
        if (this.extensionView) {
            this.extensionView.detach(true);
        }
        this.extensionView = new ExtensionView(this.server, this.idInternal, url, 'extension fill');
        this.extensionView.show(this.element);
        if (!this.element.style.height) {
            this.setHeight('150px');
        }
    }
    setHeight(height) {
        this.element.style.height = height;
    }
    onEvaluate(title, callback, error, result, _wasThrown) {
        if (error) {
            callback(error.toString());
        }
        else if (!result) {
            callback();
        }
        else {
            this.setObjectInternal(result, title, callback);
        }
    }
    createObjectPropertiesView() {
        if (this.objectPropertiesView) {
            return;
        }
        if (this.extensionView) {
            this.extensionView.detach(true);
            delete this.extensionView;
        }
        this.objectPropertiesView = new ExtensionNotifierView(this.server, this.idInternal);
        this.objectPropertiesView.show(this.element);
    }
    setObjectInternal(object, title, callback) {
        const objectPropertiesView = this.objectPropertiesView;
        // This may only happen if setPage() was called while we were evaluating the expression.
        if (!objectPropertiesView) {
            callback('operation cancelled');
            return;
        }
        objectPropertiesView.element.removeChildren();
        void UI.UIUtils.Renderer.render(object, { title, editable: false }).then(result => {
            if (!result) {
                callback();
                return;
            }
            const firstChild = result.tree && result.tree.firstChild();
            if (firstChild) {
                firstChild.expand();
            }
            objectPropertiesView.element.appendChild(result.node);
            callback();
        });
    }
}
//# sourceMappingURL=ExtensionPanel.js.map