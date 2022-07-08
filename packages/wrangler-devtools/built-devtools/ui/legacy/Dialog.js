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
import * as Common from '../../core/common/common.js';
import * as ARIAUtils from './ARIAUtils.js';
import { GlassPane } from './GlassPane.js';
import { InspectorView } from './InspectorView.js';
import { KeyboardShortcut, Keys } from './KeyboardShortcut.js';
import { WidgetFocusRestorer } from './Widget.js';
import dialogStyles from './dialog.css.legacy.js';
export class Dialog extends Common.ObjectWrapper.eventMixin(GlassPane) {
    tabIndexBehavior;
    tabIndexMap;
    focusRestorer;
    closeOnEscape;
    targetDocument;
    targetDocumentKeyDownHandler;
    escapeKeyCallback;
    constructor() {
        super();
        this.registerRequiredCSS(dialogStyles);
        this.contentElement.tabIndex = 0;
        this.contentElement.addEventListener('focus', () => this.widget().focus(), false);
        this.widget().setDefaultFocusedElement(this.contentElement);
        this.setPointerEventsBehavior("BlockedByGlassPane" /* BlockedByGlassPane */);
        this.setOutsideClickCallback(event => {
            this.hide();
            event.consume(true);
        });
        ARIAUtils.markAsModalDialog(this.contentElement);
        this.tabIndexBehavior = OutsideTabIndexBehavior.DisableAllOutsideTabIndex;
        this.tabIndexMap = new Map();
        this.focusRestorer = null;
        this.closeOnEscape = true;
        this.targetDocumentKeyDownHandler = this.onKeyDown.bind(this);
        this.escapeKeyCallback = null;
    }
    static hasInstance() {
        return Boolean(Dialog.instance);
    }
    show(where) {
        const document = (where instanceof Document ? where : (where || InspectorView.instance().element).ownerDocument);
        this.targetDocument = document;
        this.targetDocument.addEventListener('keydown', this.targetDocumentKeyDownHandler, true);
        if (Dialog.instance) {
            Dialog.instance.hide();
        }
        Dialog.instance = this;
        this.disableTabIndexOnElements(document);
        super.show(document);
        this.focusRestorer = new WidgetFocusRestorer(this.widget());
    }
    hide() {
        if (this.focusRestorer) {
            this.focusRestorer.restore();
        }
        super.hide();
        if (this.targetDocument) {
            this.targetDocument.removeEventListener('keydown', this.targetDocumentKeyDownHandler, true);
        }
        this.restoreTabIndexOnElements();
        this.dispatchEventToListeners("hidden" /* Hidden */);
        Dialog.instance = null;
    }
    setCloseOnEscape(close) {
        this.closeOnEscape = close;
    }
    setEscapeKeyCallback(callback) {
        this.escapeKeyCallback = callback;
    }
    addCloseButton() {
        const closeButton = this.contentElement.createChild('div', 'dialog-close-button', 'dt-close-button');
        closeButton.gray = true;
        closeButton.addEventListener('click', () => this.hide(), false);
    }
    setOutsideTabIndexBehavior(tabIndexBehavior) {
        this.tabIndexBehavior = tabIndexBehavior;
    }
    disableTabIndexOnElements(document) {
        if (this.tabIndexBehavior === OutsideTabIndexBehavior.PreserveTabIndex) {
            return;
        }
        let exclusionSet = null;
        if (this.tabIndexBehavior === OutsideTabIndexBehavior.PreserveMainViewTabIndex) {
            exclusionSet = this.getMainWidgetTabIndexElements(InspectorView.instance().ownerSplit());
        }
        this.tabIndexMap.clear();
        let node = document;
        for (; node; node = node.traverseNextNode(document)) {
            if (node instanceof HTMLElement) {
                const element = node;
                const tabIndex = element.tabIndex;
                if (!exclusionSet?.has(element)) {
                    if (tabIndex >= 0) {
                        this.tabIndexMap.set(element, tabIndex);
                        element.tabIndex = -1;
                    }
                    else if (element.hasAttribute('contenteditable')) {
                        this.tabIndexMap.set(element, element.hasAttribute('tabindex') ? tabIndex : 0);
                        element.tabIndex = -1;
                    }
                }
            }
        }
    }
    getMainWidgetTabIndexElements(splitWidget) {
        const elementSet = new Set();
        if (!splitWidget) {
            return elementSet;
        }
        const mainWidget = splitWidget.mainWidget();
        if (!mainWidget || !mainWidget.element) {
            return elementSet;
        }
        let node = mainWidget.element;
        for (; node; node = node.traverseNextNode(mainWidget.element)) {
            if (!(node instanceof HTMLElement)) {
                continue;
            }
            const element = node;
            const tabIndex = element.tabIndex;
            if (tabIndex < 0) {
                continue;
            }
            elementSet.add(element);
        }
        return elementSet;
    }
    restoreTabIndexOnElements() {
        for (const element of this.tabIndexMap.keys()) {
            element.tabIndex = this.tabIndexMap.get(element);
        }
        this.tabIndexMap.clear();
    }
    onKeyDown(event) {
        const keyboardEvent = event;
        if (keyboardEvent.keyCode === Keys.Esc.code && KeyboardShortcut.hasNoModifiers(event)) {
            if (this.escapeKeyCallback) {
                this.escapeKeyCallback(event);
            }
            if (event.handled) {
                return;
            }
            if (this.closeOnEscape) {
                event.consume(true);
                this.hide();
            }
        }
    }
    static instance = null;
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var OutsideTabIndexBehavior;
(function (OutsideTabIndexBehavior) {
    OutsideTabIndexBehavior["DisableAllOutsideTabIndex"] = "DisableAllTabIndex";
    OutsideTabIndexBehavior["PreserveMainViewTabIndex"] = "PreserveMainViewTabIndex";
    OutsideTabIndexBehavior["PreserveTabIndex"] = "PreserveTabIndex";
})(OutsideTabIndexBehavior || (OutsideTabIndexBehavior = {}));
//# sourceMappingURL=Dialog.js.map