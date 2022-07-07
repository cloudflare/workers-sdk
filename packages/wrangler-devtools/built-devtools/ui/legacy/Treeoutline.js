// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
 * Copyright (C) 2007 Apple Inc.  All rights reserved.
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
import * as Platform from '../../core/platform/platform.js';
import * as ARIAUtils from './ARIAUtils.js';
import * as ThemeSupport from './theme_support/theme_support.js';
import * as Utils from './utils/utils.js';
import { InplaceEditor } from './InplaceEditor.js';
import { Keys } from './KeyboardShortcut.js';
import { Tooltip } from './Tooltip.js';
import { deepElementFromPoint, enclosingNodeOrSelfWithNodeNameInArray, isEditing } from './UIUtils.js';
import treeoutlineStyles from './treeoutline.css.legacy.js';
const nodeToParentTreeElementMap = new WeakMap();
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["ElementAttached"] = "ElementAttached";
    Events["ElementsDetached"] = "ElementsDetached";
    Events["ElementExpanded"] = "ElementExpanded";
    Events["ElementCollapsed"] = "ElementCollapsed";
    Events["ElementSelected"] = "ElementSelected";
})(Events || (Events = {}));
export class TreeOutline extends Common.ObjectWrapper.ObjectWrapper {
    rootElementInternal;
    renderSelection;
    selectedTreeElement;
    expandTreeElementsWhenArrowing;
    comparator;
    contentElement;
    preventTabOrder;
    showSelectionOnKeyboardFocus;
    focusable;
    element;
    useLightSelectionColor;
    treeElementToScrollIntoView;
    centerUponScrollIntoView;
    constructor() {
        super();
        this.rootElementInternal = this.createRootElement();
        this.renderSelection = false;
        this.selectedTreeElement = null;
        this.expandTreeElementsWhenArrowing = false;
        this.comparator = null;
        this.contentElement = this.rootElementInternal.childrenListNode;
        this.contentElement.addEventListener('keydown', this.treeKeyDown.bind(this), false);
        this.preventTabOrder = false;
        this.showSelectionOnKeyboardFocus = false;
        this.focusable = true;
        this.setFocusable(true);
        this.element = this.contentElement;
        ARIAUtils.markAsTree(this.element);
        this.useLightSelectionColor = false;
        this.treeElementToScrollIntoView = null;
        this.centerUponScrollIntoView = false;
    }
    setShowSelectionOnKeyboardFocus(show, preventTabOrder) {
        this.contentElement.classList.toggle('hide-selection-when-blurred', show);
        this.preventTabOrder = Boolean(preventTabOrder);
        if (this.focusable) {
            this.contentElement.tabIndex = Boolean(preventTabOrder) ? -1 : 0;
        }
        this.showSelectionOnKeyboardFocus = show;
    }
    createRootElement() {
        const rootElement = new TreeElement();
        rootElement.treeOutline = this;
        rootElement.root = true;
        rootElement.selectable = false;
        rootElement.expanded = true;
        rootElement.childrenListNode.classList.remove('children');
        return rootElement;
    }
    rootElement() {
        return this.rootElementInternal;
    }
    firstChild() {
        return this.rootElementInternal.firstChild();
    }
    lastDescendent() {
        let last = this.rootElementInternal.lastChild();
        while (last && last.expanded && last.childCount()) {
            last = last.lastChild();
        }
        return last;
    }
    appendChild(child, comparator) {
        this.rootElementInternal.appendChild(child, comparator);
    }
    insertChild(child, index) {
        this.rootElementInternal.insertChild(child, index);
    }
    removeChild(child) {
        this.rootElementInternal.removeChild(child);
    }
    removeChildren() {
        this.rootElementInternal.removeChildren();
    }
    treeElementFromPoint(x, y) {
        const node = deepElementFromPoint(this.contentElement.ownerDocument, x, y);
        if (!node) {
            return null;
        }
        const listNode = enclosingNodeOrSelfWithNodeNameInArray(node, ['ol', 'li']);
        if (listNode) {
            return nodeToParentTreeElementMap.get(listNode) || treeElementBylistItemNode.get(listNode) || null;
        }
        return null;
    }
    treeElementFromEvent(event) {
        return event ? this.treeElementFromPoint(event.pageX, event.pageY) : null;
    }
    setComparator(comparator) {
        this.comparator = comparator;
    }
    setFocusable(focusable) {
        this.focusable = focusable;
        this.updateFocusable();
    }
    updateFocusable() {
        if (this.focusable) {
            this.contentElement.tabIndex = (this.preventTabOrder || Boolean(this.selectedTreeElement)) ? -1 : 0;
            if (this.selectedTreeElement) {
                this.selectedTreeElement.setFocusable(true);
            }
        }
        else {
            this.contentElement.removeAttribute('tabIndex');
            if (this.selectedTreeElement) {
                this.selectedTreeElement.setFocusable(false);
            }
        }
    }
    focus() {
        if (this.selectedTreeElement) {
            this.selectedTreeElement.listItemElement.focus();
        }
        else {
            this.contentElement.focus();
        }
    }
    setUseLightSelectionColor(flag) {
        this.useLightSelectionColor = flag;
    }
    getUseLightSelectionColor() {
        return this.useLightSelectionColor;
    }
    bindTreeElement(element) {
        if (element.treeOutline) {
            console.error('Binding element for the second time: ' + new Error().stack);
        }
        element.treeOutline = this;
        element.onbind();
    }
    unbindTreeElement(element) {
        if (!element.treeOutline) {
            console.error('Unbinding element that was not bound: ' + new Error().stack);
        }
        element.deselect();
        element.onunbind();
        element.treeOutline = null;
    }
    selectPrevious() {
        let nextSelectedElement = this.selectedTreeElement && this.selectedTreeElement.traversePreviousTreeElement(true);
        while (nextSelectedElement && !nextSelectedElement.selectable) {
            nextSelectedElement = nextSelectedElement.traversePreviousTreeElement(!this.expandTreeElementsWhenArrowing);
        }
        if (!nextSelectedElement) {
            return false;
        }
        nextSelectedElement.select(false, true);
        return true;
    }
    selectNext() {
        let nextSelectedElement = this.selectedTreeElement && this.selectedTreeElement.traverseNextTreeElement(true);
        while (nextSelectedElement && !nextSelectedElement.selectable) {
            nextSelectedElement = nextSelectedElement.traverseNextTreeElement(!this.expandTreeElementsWhenArrowing);
        }
        if (!nextSelectedElement) {
            return false;
        }
        nextSelectedElement.select(false, true);
        return true;
    }
    forceSelect(omitFocus = false, selectedByUser = true) {
        if (this.selectedTreeElement) {
            this.selectedTreeElement.deselect();
        }
        this.selectFirst(omitFocus, selectedByUser);
    }
    selectFirst(omitFocus = false, selectedByUser = true) {
        let first = this.firstChild();
        while (first && !first.selectable) {
            first = first.traverseNextTreeElement(true);
        }
        if (!first) {
            return false;
        }
        first.select(omitFocus, selectedByUser);
        return true;
    }
    selectLast() {
        let last = this.lastDescendent();
        while (last && !last.selectable) {
            last = last.traversePreviousTreeElement(true);
        }
        if (!last) {
            return false;
        }
        last.select(false, true);
        return true;
    }
    treeKeyDown(event) {
        if (event.shiftKey || event.metaKey || event.ctrlKey || isEditing()) {
            return;
        }
        let handled = false;
        if (!this.selectedTreeElement) {
            if (event.key === 'ArrowUp' && !event.altKey) {
                handled = this.selectLast();
            }
            else if (event.key === 'ArrowDown' && !event.altKey) {
                handled = this.selectFirst();
            }
        }
        else if (event.key === 'ArrowUp' && !event.altKey) {
            handled = this.selectPrevious();
        }
        else if (event.key === 'ArrowDown' && !event.altKey) {
            handled = this.selectNext();
        }
        else if (event.key === 'ArrowLeft') {
            handled = this.selectedTreeElement.collapseOrAscend(event.altKey);
        }
        else if (event.key === 'ArrowRight') {
            if (!this.selectedTreeElement.revealed()) {
                this.selectedTreeElement.reveal();
                handled = true;
            }
            else {
                handled = this.selectedTreeElement.descendOrExpand(event.altKey);
            }
        }
        else if (event.keyCode === 8 /* Backspace */ || event.keyCode === 46 /* Delete */) {
            handled = this.selectedTreeElement.ondelete();
        }
        else if (event.key === 'Enter') {
            handled = this.selectedTreeElement.onenter();
        }
        else if (event.keyCode === Keys.Space.code) {
            handled = this.selectedTreeElement.onspace();
        }
        else if (event.key === 'Home') {
            handled = this.selectFirst();
        }
        else if (event.key === 'End') {
            handled = this.selectLast();
        }
        if (handled) {
            event.consume(true);
        }
    }
    deferredScrollIntoView(treeElement, center) {
        const deferredScrollIntoView = () => {
            if (!this.treeElementToScrollIntoView) {
                return;
            }
            // This function doesn't use scrollIntoViewIfNeeded because it always
            // scrolls in both directions even if only one is necessary to bring the
            // item into view.
            const itemRect = this.treeElementToScrollIntoView.listItemElement.getBoundingClientRect();
            const treeRect = this.contentElement.getBoundingClientRect();
            // Usually, this.element is the tree container that scrolls. But sometimes
            // (i.e. in the Elements panel), its parent is.
            let scrollParentElement = this.element;
            while (getComputedStyle(scrollParentElement).overflow === 'visible' && scrollParentElement.parentElement) {
                scrollParentElement = scrollParentElement.parentElement;
            }
            const viewRect = scrollParentElement.getBoundingClientRect();
            const currentScrollX = viewRect.left - treeRect.left;
            const currentScrollY = viewRect.top - treeRect.top + this.contentElement.offsetTop;
            // Only scroll into view on each axis if the item is not visible at all
            // but if we do scroll and centerUponScrollIntoView is true
            // then we center the top left corner of the item in view.
            let deltaLeft = itemRect.left - treeRect.left;
            if (deltaLeft > currentScrollX && deltaLeft < currentScrollX + viewRect.width) {
                deltaLeft = currentScrollX;
            }
            else if (this.centerUponScrollIntoView) {
                deltaLeft = deltaLeft - viewRect.width / 2;
            }
            let deltaTop = itemRect.top - treeRect.top;
            if (deltaTop > currentScrollY && deltaTop < currentScrollY + viewRect.height) {
                deltaTop = currentScrollY;
            }
            else if (this.centerUponScrollIntoView) {
                deltaTop = deltaTop - viewRect.height / 2;
            }
            scrollParentElement.scrollTo(deltaLeft, deltaTop);
            this.treeElementToScrollIntoView = null;
        };
        if (!this.treeElementToScrollIntoView) {
            this.element.window().requestAnimationFrame(deferredScrollIntoView);
        }
        this.treeElementToScrollIntoView = treeElement;
        this.centerUponScrollIntoView = center;
    }
    onStartedEditingTitle(_treeElement) {
    }
}
export class TreeOutlineInShadow extends TreeOutline {
    element;
    shadowRoot;
    disclosureElement;
    renderSelection;
    constructor() {
        super();
        this.contentElement.classList.add('tree-outline');
        this.element = document.createElement('div');
        this.shadowRoot =
            Utils.createShadowRootWithCoreStyles(this.element, { cssFile: treeoutlineStyles, delegatesFocus: undefined });
        this.disclosureElement = this.shadowRoot.createChild('div', 'tree-outline-disclosure');
        this.disclosureElement.appendChild(this.contentElement);
        this.renderSelection = true;
    }
    registerRequiredCSS(cssFile) {
        ThemeSupport.ThemeSupport.instance().appendStyle(this.shadowRoot, cssFile);
    }
    registerCSSFiles(cssFiles) {
        this.shadowRoot.adoptedStyleSheets = this.shadowRoot.adoptedStyleSheets.concat(cssFiles);
    }
    hideOverflow() {
        this.disclosureElement.classList.add('tree-outline-disclosure-hide-overflow');
    }
    makeDense() {
        this.contentElement.classList.add('tree-outline-dense');
    }
    onStartedEditingTitle(treeElement) {
        const selection = this.shadowRoot.getSelection();
        if (selection) {
            selection.selectAllChildren(treeElement.titleElement);
        }
    }
}
export const treeElementBylistItemNode = new WeakMap();
export class TreeElement {
    treeOutline;
    parent;
    previousSibling;
    nextSibling;
    boundOnFocus;
    boundOnBlur;
    listItemNode;
    titleElement;
    titleInternal;
    childrenInternal;
    childrenListNode;
    hiddenInternal;
    selectableInternal;
    expanded;
    selected;
    expandable;
    #expandRecursively = true;
    collapsible;
    toggleOnClick;
    button;
    root;
    tooltipInternal;
    leadingIconsElement;
    trailingIconsElement;
    selectionElementInternal;
    disableSelectFocus;
    constructor(title, expandable) {
        this.treeOutline = null;
        this.parent = null;
        this.previousSibling = null;
        this.nextSibling = null;
        this.boundOnFocus = this.onFocus.bind(this);
        this.boundOnBlur = this.onBlur.bind(this);
        this.listItemNode = document.createElement('li');
        this.titleElement = this.listItemNode.createChild('span', 'tree-element-title');
        treeElementBylistItemNode.set(this.listItemNode, this);
        this.titleInternal = '';
        if (title) {
            this.title = title;
        }
        this.listItemNode.addEventListener('mousedown', this.handleMouseDown.bind(this), false);
        this.listItemNode.addEventListener('click', this.treeElementToggled.bind(this), false);
        this.listItemNode.addEventListener('dblclick', this.handleDoubleClick.bind(this), false);
        ARIAUtils.markAsTreeitem(this.listItemNode);
        this.childrenInternal = null;
        this.childrenListNode = document.createElement('ol');
        nodeToParentTreeElementMap.set(this.childrenListNode, this);
        this.childrenListNode.classList.add('children');
        ARIAUtils.markAsGroup(this.childrenListNode);
        this.hiddenInternal = false;
        this.selectableInternal = true;
        this.expanded = false;
        this.selected = false;
        this.setExpandable(expandable || false);
        this.collapsible = true;
        this.toggleOnClick = false;
        this.button = null;
        this.root = false;
        this.tooltipInternal = '';
        this.leadingIconsElement = null;
        this.trailingIconsElement = null;
        this.selectionElementInternal = null;
        this.disableSelectFocus = false;
    }
    static getTreeElementBylistItemNode(node) {
        return treeElementBylistItemNode.get(node);
    }
    hasAncestor(ancestor) {
        if (!ancestor) {
            return false;
        }
        let currentNode = this.parent;
        while (currentNode) {
            if (ancestor === currentNode) {
                return true;
            }
            currentNode = currentNode.parent;
        }
        return false;
    }
    hasAncestorOrSelf(ancestor) {
        return this === ancestor || this.hasAncestor(ancestor);
    }
    isHidden() {
        if (this.hidden) {
            return true;
        }
        let currentNode = this.parent;
        while (currentNode) {
            if (currentNode.hidden) {
                return true;
            }
            currentNode = currentNode.parent;
        }
        return false;
    }
    children() {
        return this.childrenInternal || [];
    }
    childCount() {
        return this.childrenInternal ? this.childrenInternal.length : 0;
    }
    firstChild() {
        return this.childrenInternal ? this.childrenInternal[0] : null;
    }
    lastChild() {
        return this.childrenInternal ? this.childrenInternal[this.childrenInternal.length - 1] : null;
    }
    childAt(index) {
        return this.childrenInternal ? this.childrenInternal[index] : null;
    }
    indexOfChild(child) {
        return this.childrenInternal ? this.childrenInternal.indexOf(child) : -1;
    }
    appendChild(child, comparator) {
        if (!this.childrenInternal) {
            this.childrenInternal = [];
        }
        let insertionIndex;
        if (comparator) {
            insertionIndex = Platform.ArrayUtilities.lowerBound(this.childrenInternal, child, comparator);
        }
        else if (this.treeOutline && this.treeOutline.comparator) {
            insertionIndex = Platform.ArrayUtilities.lowerBound(this.childrenInternal, child, this.treeOutline.comparator);
        }
        else {
            insertionIndex = this.childrenInternal.length;
        }
        this.insertChild(child, insertionIndex);
    }
    insertChild(child, index) {
        if (!this.childrenInternal) {
            this.childrenInternal = [];
        }
        if (!child) {
            throw 'child can\'t be undefined or null';
        }
        console.assert(!child.parent, 'Attempting to insert a child that is already in the tree, reparenting is not supported.');
        const previousChild = (index > 0 ? this.childrenInternal[index - 1] : null);
        if (previousChild) {
            previousChild.nextSibling = child;
            child.previousSibling = previousChild;
        }
        else {
            child.previousSibling = null;
        }
        const nextChild = this.childrenInternal[index];
        if (nextChild) {
            nextChild.previousSibling = child;
            child.nextSibling = nextChild;
        }
        else {
            child.nextSibling = null;
        }
        this.childrenInternal.splice(index, 0, child);
        this.setExpandable(true);
        child.parent = this;
        if (this.treeOutline) {
            this.treeOutline.bindTreeElement(child);
        }
        for (let current = child.firstChild(); this.treeOutline && current; current = current.traverseNextTreeElement(false, child, true)) {
            this.treeOutline.bindTreeElement(current);
        }
        child.onattach();
        child.ensureSelection();
        if (this.treeOutline) {
            this.treeOutline.dispatchEventToListeners(Events.ElementAttached, child);
        }
        const nextSibling = child.nextSibling ? child.nextSibling.listItemNode : null;
        this.childrenListNode.insertBefore(child.listItemNode, nextSibling);
        this.childrenListNode.insertBefore(child.childrenListNode, nextSibling);
        if (child.selected) {
            child.select();
        }
        if (child.expanded) {
            child.expand();
        }
    }
    removeChildAtIndex(childIndex) {
        if (!this.childrenInternal || childIndex < 0 || childIndex >= this.childrenInternal.length) {
            throw 'childIndex out of range';
        }
        const child = this.childrenInternal[childIndex];
        this.childrenInternal.splice(childIndex, 1);
        const parent = child.parent;
        if (this.treeOutline && this.treeOutline.selectedTreeElement &&
            this.treeOutline.selectedTreeElement.hasAncestorOrSelf(child)) {
            if (child.nextSibling) {
                child.nextSibling.select(true);
            }
            else if (child.previousSibling) {
                child.previousSibling.select(true);
            }
            else if (parent) {
                parent.select(true);
            }
        }
        if (child.previousSibling) {
            child.previousSibling.nextSibling = child.nextSibling;
        }
        if (child.nextSibling) {
            child.nextSibling.previousSibling = child.previousSibling;
        }
        child.parent = null;
        if (this.treeOutline) {
            this.treeOutline.unbindTreeElement(child);
        }
        for (let current = child.firstChild(); this.treeOutline && current; current = current.traverseNextTreeElement(false, child, true)) {
            this.treeOutline.unbindTreeElement(current);
        }
        child.detach();
        if (this.treeOutline) {
            this.treeOutline.dispatchEventToListeners(Events.ElementsDetached);
        }
    }
    removeChild(child) {
        if (!child) {
            throw 'child can\'t be undefined or null';
        }
        if (child.parent !== this) {
            return;
        }
        const childIndex = this.childrenInternal ? this.childrenInternal.indexOf(child) : -1;
        if (childIndex === -1) {
            throw 'child not found in this node\'s children';
        }
        this.removeChildAtIndex(childIndex);
    }
    removeChildren() {
        if (!this.root && this.treeOutline && this.treeOutline.selectedTreeElement &&
            this.treeOutline.selectedTreeElement.hasAncestorOrSelf(this)) {
            this.select(true);
        }
        if (this.childrenInternal) {
            for (const child of this.childrenInternal) {
                child.previousSibling = null;
                child.nextSibling = null;
                child.parent = null;
                if (this.treeOutline) {
                    this.treeOutline.unbindTreeElement(child);
                }
                for (let current = child.firstChild(); this.treeOutline && current; current = current.traverseNextTreeElement(false, child, true)) {
                    this.treeOutline.unbindTreeElement(current);
                }
                child.detach();
            }
        }
        this.childrenInternal = [];
        if (this.treeOutline) {
            this.treeOutline.dispatchEventToListeners(Events.ElementsDetached);
        }
    }
    get selectable() {
        if (this.isHidden()) {
            return false;
        }
        return this.selectableInternal;
    }
    set selectable(x) {
        this.selectableInternal = x;
    }
    get listItemElement() {
        return this.listItemNode;
    }
    get childrenListElement() {
        return this.childrenListNode;
    }
    get title() {
        return this.titleInternal;
    }
    set title(x) {
        if (this.titleInternal === x) {
            return;
        }
        this.titleInternal = x;
        if (typeof x === 'string') {
            this.titleElement.textContent = x;
            this.tooltip = x;
        }
        else {
            this.titleElement = x;
            this.tooltip = '';
        }
        this.listItemNode.removeChildren();
        if (this.leadingIconsElement) {
            this.listItemNode.appendChild(this.leadingIconsElement);
        }
        this.listItemNode.appendChild(this.titleElement);
        if (this.trailingIconsElement) {
            this.listItemNode.appendChild(this.trailingIconsElement);
        }
        this.ensureSelection();
    }
    titleAsText() {
        if (!this.titleInternal) {
            return '';
        }
        if (typeof this.titleInternal === 'string') {
            return this.titleInternal;
        }
        return this.titleInternal.textContent || '';
    }
    startEditingTitle(editingConfig) {
        InplaceEditor.startEditing(this.titleElement, editingConfig);
        if (this.treeOutline) {
            this.treeOutline.onStartedEditingTitle(this);
        }
    }
    setLeadingIcons(icons) {
        if (!this.leadingIconsElement && !icons.length) {
            return;
        }
        if (!this.leadingIconsElement) {
            this.leadingIconsElement = document.createElement('div');
            this.leadingIconsElement.classList.add('leading-icons');
            this.leadingIconsElement.classList.add('icons-container');
            this.listItemNode.insertBefore(this.leadingIconsElement, this.titleElement);
            this.ensureSelection();
        }
        this.leadingIconsElement.removeChildren();
        for (const icon of icons) {
            this.leadingIconsElement.appendChild(icon);
        }
    }
    setTrailingIcons(icons) {
        if (!this.trailingIconsElement && !icons.length) {
            return;
        }
        if (!this.trailingIconsElement) {
            this.trailingIconsElement = document.createElement('div');
            this.trailingIconsElement.classList.add('trailing-icons');
            this.trailingIconsElement.classList.add('icons-container');
            this.listItemNode.appendChild(this.trailingIconsElement);
            this.ensureSelection();
        }
        this.trailingIconsElement.removeChildren();
        for (const icon of icons) {
            this.trailingIconsElement.appendChild(icon);
        }
    }
    get tooltip() {
        return this.tooltipInternal;
    }
    set tooltip(x) {
        if (this.tooltipInternal === x) {
            return;
        }
        this.tooltipInternal = x;
        Tooltip.install(this.listItemNode, x);
    }
    isExpandable() {
        return this.expandable;
    }
    setExpandable(expandable) {
        if (this.expandable === expandable) {
            return;
        }
        this.expandable = expandable;
        this.listItemNode.classList.toggle('parent', expandable);
        if (!expandable) {
            this.collapse();
            ARIAUtils.unsetExpandable(this.listItemNode);
        }
        else {
            ARIAUtils.setExpanded(this.listItemNode, false);
        }
    }
    isExpandRecursively() {
        return this.#expandRecursively;
    }
    setExpandRecursively(expandRecursively) {
        this.#expandRecursively = expandRecursively;
    }
    isCollapsible() {
        return this.collapsible;
    }
    setCollapsible(collapsible) {
        if (this.collapsible === collapsible) {
            return;
        }
        this.collapsible = collapsible;
        this.listItemNode.classList.toggle('always-parent', !collapsible);
        if (!collapsible) {
            this.expand();
        }
    }
    get hidden() {
        return this.hiddenInternal;
    }
    set hidden(x) {
        if (this.hiddenInternal === x) {
            return;
        }
        this.hiddenInternal = x;
        this.listItemNode.classList.toggle('hidden', x);
        this.childrenListNode.classList.toggle('hidden', x);
        if (x && this.treeOutline && this.treeOutline.selectedTreeElement &&
            this.treeOutline.selectedTreeElement.hasAncestorOrSelf(this)) {
            const hadFocus = this.treeOutline.selectedTreeElement.listItemElement.hasFocus();
            this.treeOutline.forceSelect(!hadFocus, /* selectedByUser */ false);
        }
    }
    invalidateChildren() {
        if (this.childrenInternal) {
            this.removeChildren();
            this.childrenInternal = null;
        }
    }
    ensureSelection() {
        if (!this.treeOutline || !this.treeOutline.renderSelection) {
            return;
        }
        if (!this.selectionElementInternal) {
            this.selectionElementInternal = document.createElement('div');
            this.selectionElementInternal.classList.add('selection');
            this.selectionElementInternal.classList.add('fill');
        }
        this.listItemNode.insertBefore(this.selectionElementInternal, this.listItemElement.firstChild);
    }
    treeElementToggled(event) {
        const element = event.currentTarget;
        if (!element || treeElementBylistItemNode.get(element) !== this || element.hasSelection()) {
            return;
        }
        console.assert(Boolean(this.treeOutline));
        const showSelectionOnKeyboardFocus = this.treeOutline ? this.treeOutline.showSelectionOnKeyboardFocus : false;
        const toggleOnClick = this.toggleOnClick && (showSelectionOnKeyboardFocus || !this.selectable);
        const isInTriangle = this.isEventWithinDisclosureTriangle(event);
        if (!toggleOnClick && !isInTriangle) {
            return;
        }
        if (this.expanded) {
            if (event.altKey) {
                this.collapseRecursively();
            }
            else {
                this.collapse();
            }
        }
        else {
            if (event.altKey) {
                void this.expandRecursively();
            }
            else {
                this.expand();
            }
        }
        event.consume();
    }
    handleMouseDown(event) {
        const element = event.currentTarget;
        if (!element) {
            return;
        }
        if (!this.selectable) {
            return;
        }
        if (treeElementBylistItemNode.get(element) !== this) {
            return;
        }
        if (this.isEventWithinDisclosureTriangle(event)) {
            return;
        }
        this.selectOnMouseDown(event);
    }
    handleDoubleClick(event) {
        const element = event.currentTarget;
        if (!element || treeElementBylistItemNode.get(element) !== this) {
            return;
        }
        const handled = this.ondblclick(event);
        if (handled) {
            return;
        }
        if (this.expandable && !this.expanded) {
            this.expand();
        }
    }
    detach() {
        this.listItemNode.remove();
        this.childrenListNode.remove();
    }
    collapse() {
        if (!this.expanded || !this.collapsible) {
            return;
        }
        this.listItemNode.classList.remove('expanded');
        this.childrenListNode.classList.remove('expanded');
        ARIAUtils.setExpanded(this.listItemNode, false);
        this.expanded = false;
        this.oncollapse();
        if (this.treeOutline) {
            this.treeOutline.dispatchEventToListeners(Events.ElementCollapsed, this);
        }
        const selectedTreeElement = this.treeOutline && this.treeOutline.selectedTreeElement;
        if (selectedTreeElement && selectedTreeElement.hasAncestor(this)) {
            this.select(/* omitFocus */ true, /* selectedByUser */ true);
        }
    }
    collapseRecursively() {
        let item = this;
        while (item) {
            if (item.expanded) {
                item.collapse();
            }
            item = item.traverseNextTreeElement(false, this, true);
        }
    }
    collapseChildren() {
        if (!this.childrenInternal) {
            return;
        }
        for (const child of this.childrenInternal) {
            child.collapseRecursively();
        }
    }
    expand() {
        if (!this.expandable || (this.expanded && this.childrenInternal)) {
            return;
        }
        // Set this before onpopulate. Since onpopulate can add elements, this makes
        // sure the expanded flag is true before calling those functions. This prevents the possibility
        // of an infinite loop if onpopulate were to call expand.
        this.expanded = true;
        void this.populateIfNeeded();
        this.listItemNode.classList.add('expanded');
        this.childrenListNode.classList.add('expanded');
        ARIAUtils.setExpanded(this.listItemNode, true);
        if (this.treeOutline) {
            this.onexpand();
            this.treeOutline.dispatchEventToListeners(Events.ElementExpanded, this);
        }
    }
    async expandRecursively(maxDepth) {
        let item = this;
        const info = { depthChange: 0 };
        let depth = 0;
        // The Inspector uses TreeOutlines to represents object properties, so recursive expansion
        // in some case can be infinite, since JavaScript objects can hold circular references.
        // So default to a recursion cap of 3 levels, since that gives fairly good results.
        if (maxDepth === undefined || isNaN(maxDepth)) {
            maxDepth = 3;
        }
        do {
            if (item.isExpandRecursively()) {
                await item.populateIfNeeded();
                if (depth < maxDepth) {
                    item.expand();
                }
            }
            item = item.traverseNextTreeElement(!item.isExpandRecursively(), this, true, info);
            depth += info.depthChange;
        } while (item !== null);
    }
    collapseOrAscend(altKey) {
        if (this.expanded && this.collapsible) {
            if (altKey) {
                this.collapseRecursively();
            }
            else {
                this.collapse();
            }
            return true;
        }
        if (!this.parent || this.parent.root) {
            return false;
        }
        if (!this.parent.selectable) {
            this.parent.collapse();
            return true;
        }
        let nextSelectedElement = this.parent;
        while (nextSelectedElement && !nextSelectedElement.selectable) {
            nextSelectedElement = nextSelectedElement.parent;
        }
        if (!nextSelectedElement) {
            return false;
        }
        nextSelectedElement.select(false, true);
        return true;
    }
    descendOrExpand(altKey) {
        if (!this.expandable) {
            return false;
        }
        if (!this.expanded) {
            if (altKey) {
                void this.expandRecursively();
            }
            else {
                this.expand();
            }
            return true;
        }
        let nextSelectedElement = this.firstChild();
        while (nextSelectedElement && !nextSelectedElement.selectable) {
            nextSelectedElement = nextSelectedElement.nextSibling;
        }
        if (!nextSelectedElement) {
            return false;
        }
        nextSelectedElement.select(false, true);
        return true;
    }
    reveal(center) {
        let currentAncestor = this.parent;
        while (currentAncestor && !currentAncestor.root) {
            if (!currentAncestor.expanded) {
                currentAncestor.expand();
            }
            currentAncestor = currentAncestor.parent;
        }
        if (this.treeOutline) {
            this.treeOutline.deferredScrollIntoView(this, Boolean(center));
        }
    }
    revealed() {
        let currentAncestor = this.parent;
        while (currentAncestor && !currentAncestor.root) {
            if (!currentAncestor.expanded) {
                return false;
            }
            currentAncestor = currentAncestor.parent;
        }
        return true;
    }
    selectOnMouseDown(event) {
        if (this.select(false, true)) {
            event.consume(true);
        }
        if (this.listItemNode.draggable && this.selectionElementInternal && this.treeOutline) {
            const marginLeft = this.treeOutline.element.getBoundingClientRect().left -
                this.listItemNode.getBoundingClientRect().left - this.treeOutline.element.scrollLeft;
            // By default the left margin extends far off screen. This is not a problem except when dragging an element.
            // Setting the margin once here should be fine, because we believe the left margin should never change.
            this.selectionElementInternal.style.setProperty('margin-left', marginLeft + 'px');
        }
    }
    select(omitFocus, selectedByUser) {
        omitFocus = omitFocus || this.disableSelectFocus;
        if (!this.treeOutline || !this.selectable || this.selected) {
            if (!omitFocus) {
                this.listItemElement.focus();
            }
            return false;
        }
        // Wait to deselect this element so that focus only changes once
        const lastSelected = this.treeOutline.selectedTreeElement;
        this.treeOutline.selectedTreeElement = null;
        if (this.treeOutline.rootElementInternal === this) {
            if (lastSelected) {
                lastSelected.deselect();
            }
            if (!omitFocus) {
                this.listItemElement.focus();
            }
            return false;
        }
        this.selected = true;
        this.treeOutline.selectedTreeElement = this;
        this.treeOutline.updateFocusable();
        if (!omitFocus || this.treeOutline.contentElement.hasFocus()) {
            this.listItemElement.focus();
        }
        this.listItemNode.classList.add('selected');
        ARIAUtils.setSelected(this.listItemNode, true);
        this.treeOutline.dispatchEventToListeners(Events.ElementSelected, this);
        if (lastSelected) {
            lastSelected.deselect();
        }
        return this.onselect(selectedByUser);
    }
    setFocusable(focusable) {
        if (focusable) {
            this.listItemNode.setAttribute('tabIndex', (this.treeOutline && this.treeOutline.preventTabOrder) ? '-1' : '0');
            this.listItemNode.addEventListener('focus', this.boundOnFocus, false);
            this.listItemNode.addEventListener('blur', this.boundOnBlur, false);
        }
        else {
            this.listItemNode.removeAttribute('tabIndex');
            this.listItemNode.removeEventListener('focus', this.boundOnFocus, false);
            this.listItemNode.removeEventListener('blur', this.boundOnBlur, false);
        }
    }
    onFocus() {
        if (!this.treeOutline || this.treeOutline.getUseLightSelectionColor()) {
            return;
        }
        if (!this.treeOutline.contentElement.classList.contains('hide-selection-when-blurred')) {
            this.listItemNode.classList.add('force-white-icons');
        }
    }
    onBlur() {
        if (!this.treeOutline || this.treeOutline.getUseLightSelectionColor()) {
            return;
        }
        if (!this.treeOutline.contentElement.classList.contains('hide-selection-when-blurred')) {
            this.listItemNode.classList.remove('force-white-icons');
        }
    }
    revealAndSelect(omitFocus) {
        this.reveal(true);
        this.select(omitFocus);
    }
    deselect() {
        const hadFocus = this.listItemNode.hasFocus();
        this.selected = false;
        this.listItemNode.classList.remove('selected');
        ARIAUtils.clearSelected(this.listItemNode);
        this.setFocusable(false);
        if (this.treeOutline && this.treeOutline.selectedTreeElement === this) {
            this.treeOutline.selectedTreeElement = null;
            this.treeOutline.updateFocusable();
            if (hadFocus) {
                this.treeOutline.focus();
            }
        }
    }
    async populateIfNeeded() {
        if (this.treeOutline && this.expandable && !this.childrenInternal) {
            this.childrenInternal = [];
            await this.onpopulate();
        }
    }
    async onpopulate() {
        // Overridden by subclasses.
    }
    onenter() {
        return false;
    }
    ondelete() {
        return false;
    }
    onspace() {
        return false;
    }
    onbind() {
    }
    onunbind() {
    }
    onattach() {
    }
    onexpand() {
    }
    oncollapse() {
    }
    ondblclick(_e) {
        return false;
    }
    onselect(_selectedByUser) {
        return false;
    }
    traverseNextTreeElement(skipUnrevealed, stayWithin, dontPopulate, info) {
        if (!dontPopulate) {
            void this.populateIfNeeded();
        }
        if (info) {
            info.depthChange = 0;
        }
        let element = skipUnrevealed ? (this.revealed() ? this.firstChild() : null) : this.firstChild();
        if (element && (!skipUnrevealed || (skipUnrevealed && this.expanded))) {
            if (info) {
                info.depthChange = 1;
            }
            return element;
        }
        if (this === stayWithin) {
            return null;
        }
        element = skipUnrevealed ? (this.revealed() ? this.nextSibling : null) : this.nextSibling;
        if (element) {
            return element;
        }
        element = this;
        while (element && !element.root &&
            !(skipUnrevealed ? (element.revealed() ? element.nextSibling : null) : element.nextSibling) &&
            element.parent !== stayWithin) {
            if (info) {
                info.depthChange -= 1;
            }
            element = element.parent;
        }
        if (!element || element.root) {
            return null;
        }
        return (skipUnrevealed ? (element.revealed() ? element.nextSibling : null) : element.nextSibling);
    }
    traversePreviousTreeElement(skipUnrevealed, dontPopulate) {
        let element = skipUnrevealed ? (this.revealed() ? this.previousSibling : null) : this.previousSibling;
        if (!dontPopulate && element) {
            void element.populateIfNeeded();
        }
        while (element &&
            (skipUnrevealed ? (element.revealed() && element.expanded ? element.lastChild() : null) :
                element.lastChild())) {
            if (!dontPopulate) {
                void element.populateIfNeeded();
            }
            element =
                (skipUnrevealed ? (element.revealed() && element.expanded ? element.lastChild() : null) :
                    element.lastChild());
        }
        if (element) {
            return element;
        }
        if (!this.parent || this.parent.root) {
            return null;
        }
        return this.parent;
    }
    isEventWithinDisclosureTriangle(event) {
        const arrowToggleWidth = 10;
        // FIXME: We should not use getComputedStyle(). For that we need to get rid of using ::before for disclosure triangle. (http://webk.it/74446)
        const paddingLeftValue = window.getComputedStyle(this.listItemNode).paddingLeft;
        console.assert(paddingLeftValue.endsWith('px'));
        const computedLeftPadding = parseFloat(paddingLeftValue);
        const left = this.listItemNode.totalOffsetLeft() + computedLeftPadding;
        return event.pageX >= left && event.pageX <= left + arrowToggleWidth && this.expandable;
    }
    setDisableSelectFocus(toggle) {
        this.disableSelectFocus = toggle;
    }
}
//# sourceMappingURL=Treeoutline.js.map