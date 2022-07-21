// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import xhrBreakpointsSidebarPaneStyles from './xhrBreakpointsSidebarPane.css.js';
const UIStrings = {
    /**
    *@description Title of the 'XHR/fetch Breakpoints' tool in the bottom sidebar of the Sources tool
    */
    xhrfetchBreakpoints: 'XHR/fetch Breakpoints',
    /**
    *@description Text to indicate there are no breakpoints
    */
    noBreakpoints: 'No breakpoints',
    /**
    *@description Label for a button in the Sources panel that opens the input field to create a new XHR/fetch breakpoint.
    */
    addXhrfetchBreakpoint: 'Add XHR/fetch breakpoint',
    /**
    *@description Text to add a breakpoint
    */
    addBreakpoint: 'Add breakpoint',
    /**
    *@description Input element container text content in XHRBreakpoints Sidebar Pane of the JavaScript Debugging pane in the Sources panel or the DOM Breakpoints pane in the Elements panel
    */
    breakWhenUrlContains: 'Break when URL contains:',
    /**
    *@description Accessible label for XHR/fetch breakpoint text input
    */
    urlBreakpoint: 'URL Breakpoint',
    /**
    *@description Text in XHRBreakpoints Sidebar Pane of the JavaScript Debugging pane in the Sources panel or the DOM Breakpoints pane in the Elements panel
    *@example {example.com} PH1
    */
    urlContainsS: 'URL contains "{PH1}"',
    /**
    *@description Text in XHRBreakpoints Sidebar Pane of the JavaScript Debugging pane in the Sources panel or the DOM Breakpoints pane in the Elements panel
    */
    anyXhrOrFetch: 'Any XHR or fetch',
    /**
    *@description Screen reader description of a hit breakpoint in the Sources panel
    */
    breakpointHit: 'breakpoint hit',
    /**
    *@description Text to remove all breakpoints
    */
    removeAllBreakpoints: 'Remove all breakpoints',
    /**
    *@description Text to remove a breakpoint
    */
    removeBreakpoint: 'Remove breakpoint',
};
const str_ = i18n.i18n.registerUIStrings('panels/browser_debugger/XHRBreakpointsSidebarPane.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const containerToBreakpointEntry = new WeakMap();
const breakpointEntryToCheckbox = new WeakMap();
let xhrBreakpointsSidebarPaneInstance;
export class XHRBreakpointsSidebarPane extends UI.Widget.VBox {
    #breakpoints;
    #list;
    #emptyElement;
    #breakpointElements;
    #addButton;
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    #hitBreakpoint;
    constructor() {
        super(true);
        this.#breakpoints = new UI.ListModel.ListModel();
        this.#list = new UI.ListControl.ListControl(this.#breakpoints, this, UI.ListControl.ListMode.NonViewport);
        this.contentElement.appendChild(this.#list.element);
        this.#list.element.classList.add('breakpoint-list', 'hidden');
        UI.ARIAUtils.markAsList(this.#list.element);
        UI.ARIAUtils.setAccessibleName(this.#list.element, i18nString(UIStrings.xhrfetchBreakpoints));
        this.#emptyElement = this.contentElement.createChild('div', 'gray-info-message');
        this.#emptyElement.textContent = i18nString(UIStrings.noBreakpoints);
        this.#breakpointElements = new Map();
        this.#addButton = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.addXhrfetchBreakpoint), 'largeicon-add');
        this.#addButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, () => {
            void this.addButtonClicked();
        });
        this.#emptyElement.addEventListener('contextmenu', this.emptyElementContextMenu.bind(this), true);
        this.#emptyElement.tabIndex = -1;
        this.restoreBreakpoints();
        this.update();
    }
    static instance() {
        if (!xhrBreakpointsSidebarPaneInstance) {
            xhrBreakpointsSidebarPaneInstance = new XHRBreakpointsSidebarPane();
        }
        return xhrBreakpointsSidebarPaneInstance;
    }
    toolbarItems() {
        return [this.#addButton];
    }
    emptyElementContextMenu(event) {
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        contextMenu.defaultSection().appendItem(i18nString(UIStrings.addBreakpoint), this.addButtonClicked.bind(this));
        void contextMenu.show();
    }
    async addButtonClicked() {
        await UI.ViewManager.ViewManager.instance().showView('sources.xhrBreakpoints');
        const inputElementContainer = document.createElement('p');
        inputElementContainer.classList.add('breakpoint-condition');
        inputElementContainer.textContent = i18nString(UIStrings.breakWhenUrlContains);
        const inputElement = inputElementContainer.createChild('span', 'breakpoint-condition-input');
        UI.ARIAUtils.setAccessibleName(inputElement, i18nString(UIStrings.urlBreakpoint));
        this.addListElement(inputElementContainer, this.#list.element.firstChild);
        function finishEditing(accept, e, text) {
            this.removeListElement(inputElementContainer);
            if (accept) {
                SDK.DOMDebuggerModel.DOMDebuggerManager.instance().addXHRBreakpoint(text, true);
                this.setBreakpoint(text);
            }
            this.update();
        }
        const config = new UI.InplaceEditor.Config(finishEditing.bind(this, true), finishEditing.bind(this, false));
        // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        UI.InplaceEditor.InplaceEditor.startEditing(inputElement, config);
    }
    heightForItem(_item) {
        return 0;
    }
    isItemSelectable(_item) {
        return true;
    }
    setBreakpoint(breakKeyword) {
        if (this.#breakpoints.indexOf(breakKeyword) !== -1) {
            this.#list.refreshItem(breakKeyword);
        }
        else {
            this.#breakpoints.insertWithComparator(breakKeyword, (a, b) => {
                if (a > b) {
                    return 1;
                }
                if (a < b) {
                    return -1;
                }
                return 0;
            });
        }
        if (!this.#list.selectedItem() || !this.hasFocus()) {
            this.#list.selectItem(this.#breakpoints.at(0));
        }
    }
    createElementForItem(item) {
        const listItemElement = document.createElement('div');
        UI.ARIAUtils.markAsListitem(listItemElement);
        const element = listItemElement.createChild('div', 'breakpoint-entry');
        containerToBreakpointEntry.set(listItemElement, element);
        const enabled = SDK.DOMDebuggerModel.DOMDebuggerManager.instance().xhrBreakpoints().get(item) || false;
        UI.ARIAUtils.markAsCheckbox(element);
        UI.ARIAUtils.setChecked(element, enabled);
        element.addEventListener('contextmenu', this.contextMenu.bind(this, item), true);
        const title = item ? i18nString(UIStrings.urlContainsS, { PH1: item }) : i18nString(UIStrings.anyXhrOrFetch);
        const label = UI.UIUtils.CheckboxLabel.create(title, enabled);
        UI.ARIAUtils.markAsHidden(label);
        UI.ARIAUtils.setAccessibleName(element, title);
        element.appendChild(label);
        label.checkboxElement.addEventListener('click', this.checkboxClicked.bind(this, item, enabled), false);
        element.addEventListener('click', event => {
            if (event.target === element) {
                this.checkboxClicked(item, enabled);
            }
        }, false);
        breakpointEntryToCheckbox.set(element, label.checkboxElement);
        label.checkboxElement.tabIndex = -1;
        element.tabIndex = -1;
        if (item === this.#list.selectedItem()) {
            element.tabIndex = 0;
            this.setDefaultFocusedElement(element);
        }
        element.addEventListener('keydown', event => {
            let handled = false;
            if (event.key === ' ') {
                this.checkboxClicked(item, enabled);
                handled = true;
            }
            else if (event.key === 'Enter') {
                this.labelClicked(item);
                handled = true;
            }
            if (handled) {
                event.consume(true);
            }
        });
        if (item === this.#hitBreakpoint) {
            element.classList.add('breakpoint-hit');
            UI.ARIAUtils.setDescription(element, i18nString(UIStrings.breakpointHit));
        }
        label.classList.add('cursor-auto');
        label.textElement.addEventListener('dblclick', this.labelClicked.bind(this, item), false);
        this.#breakpointElements.set(item, listItemElement);
        return listItemElement;
    }
    selectedItemChanged(from, to, fromElement, toElement) {
        if (fromElement) {
            const breakpointEntryElement = containerToBreakpointEntry.get(fromElement);
            if (!breakpointEntryElement) {
                throw new Error('Expected breakpoint entry to be found for an element');
            }
            breakpointEntryElement.tabIndex = -1;
        }
        if (toElement) {
            const breakpointEntryElement = containerToBreakpointEntry.get(toElement);
            if (!breakpointEntryElement) {
                throw new Error('Expected breakpoint entry to be found for an element');
            }
            this.setDefaultFocusedElement(breakpointEntryElement);
            breakpointEntryElement.tabIndex = 0;
            if (this.hasFocus()) {
                breakpointEntryElement.focus();
            }
        }
    }
    updateSelectedItemARIA(_fromElement, _toElement) {
        return true;
    }
    removeBreakpoint(breakKeyword) {
        const index = this.#breakpoints.indexOf(breakKeyword);
        if (index >= 0) {
            this.#breakpoints.remove(index);
        }
        this.#breakpointElements.delete(breakKeyword);
        this.update();
    }
    addListElement(element, beforeNode) {
        this.#list.element.insertBefore(element, beforeNode);
        this.#emptyElement.classList.add('hidden');
        this.#list.element.classList.remove('hidden');
    }
    removeListElement(element) {
        this.#list.element.removeChild(element);
        if (!this.#list.element.firstElementChild) {
            this.#emptyElement.classList.remove('hidden');
            this.#list.element.classList.add('hidden');
        }
    }
    contextMenu(breakKeyword, event) {
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        function removeBreakpoint() {
            SDK.DOMDebuggerModel.DOMDebuggerManager.instance().removeXHRBreakpoint(breakKeyword);
            this.removeBreakpoint(breakKeyword);
        }
        function removeAllBreakpoints() {
            for (const url of this.#breakpointElements.keys()) {
                SDK.DOMDebuggerModel.DOMDebuggerManager.instance().removeXHRBreakpoint(url);
                this.removeBreakpoint(url);
            }
            this.update();
        }
        const removeAllTitle = i18nString(UIStrings.removeAllBreakpoints);
        contextMenu.defaultSection().appendItem(i18nString(UIStrings.addBreakpoint), this.addButtonClicked.bind(this));
        contextMenu.defaultSection().appendItem(i18nString(UIStrings.removeBreakpoint), removeBreakpoint.bind(this));
        contextMenu.defaultSection().appendItem(removeAllTitle, removeAllBreakpoints.bind(this));
        void contextMenu.show();
    }
    checkboxClicked(breakKeyword, checked) {
        const hadFocus = this.hasFocus();
        SDK.DOMDebuggerModel.DOMDebuggerManager.instance().toggleXHRBreakpoint(breakKeyword, !checked);
        this.#list.refreshItem(breakKeyword);
        this.#list.selectItem(breakKeyword);
        if (hadFocus) {
            this.focus();
        }
    }
    labelClicked(breakKeyword) {
        const element = this.#breakpointElements.get(breakKeyword);
        const inputElement = document.createElement('span');
        inputElement.classList.add('breakpoint-condition');
        inputElement.textContent = breakKeyword;
        if (element) {
            this.#list.element.insertBefore(inputElement, element);
            element.classList.add('hidden');
        }
        function finishEditing(accept, e, text) {
            this.removeListElement(inputElement);
            if (accept) {
                SDK.DOMDebuggerModel.DOMDebuggerManager.instance().removeXHRBreakpoint(breakKeyword);
                this.removeBreakpoint(breakKeyword);
                let enabled = true;
                if (element) {
                    const breakpointEntryElement = containerToBreakpointEntry.get(element);
                    const checkboxElement = breakpointEntryElement ? breakpointEntryToCheckbox.get(breakpointEntryElement) : undefined;
                    if (checkboxElement) {
                        enabled = checkboxElement.checked;
                    }
                }
                SDK.DOMDebuggerModel.DOMDebuggerManager.instance().addXHRBreakpoint(text, enabled);
                this.setBreakpoint(text);
                this.#list.selectItem(text);
            }
            else if (element) {
                element.classList.remove('hidden');
            }
            this.focus();
        }
        const config = new UI.InplaceEditor.Config(finishEditing.bind(this, true), finishEditing.bind(this, false));
        // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        UI.InplaceEditor.InplaceEditor.startEditing(inputElement, config);
    }
    flavorChanged(_object) {
        this.update();
    }
    update() {
        const isEmpty = this.#breakpoints.length === 0;
        this.#list.element.classList.toggle('hidden', isEmpty);
        this.#emptyElement.classList.toggle('hidden', !isEmpty);
        const details = UI.Context.Context.instance().flavor(SDK.DebuggerModel.DebuggerPausedDetails);
        if (!details || details.reason !== "XHR" /* XHR */) {
            if (this.#hitBreakpoint) {
                const oldHitBreakpoint = this.#hitBreakpoint;
                this.#hitBreakpoint = undefined;
                if (this.#breakpoints.indexOf(oldHitBreakpoint) >= 0) {
                    this.#list.refreshItem(oldHitBreakpoint);
                }
            }
            return;
        }
        const url = details.auxData && details.auxData['breakpointURL'];
        this.#hitBreakpoint = url;
        if (this.#breakpoints.indexOf(url) < 0) {
            return;
        }
        this.#list.refreshItem(url);
        void UI.ViewManager.ViewManager.instance().showView('sources.xhrBreakpoints');
    }
    restoreBreakpoints() {
        const breakpoints = SDK.DOMDebuggerModel.DOMDebuggerManager.instance().xhrBreakpoints();
        for (const url of breakpoints.keys()) {
            this.setBreakpoint(url);
        }
    }
    wasShown() {
        super.wasShown();
        this.registerCSSFiles([xhrBreakpointsSidebarPaneStyles]);
    }
}
//# sourceMappingURL=XHRBreakpointsSidebarPane.js.map