// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 * Copyright (C) 2011 Google Inc. All Rights Reserved.
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
import * as DOMExtension from '../../core/dom_extension/dom_extension.js';
import * as Platform from '../../core/platform/platform.js';
import * as Helpers from '../components/helpers/helpers.js';
import { Constraints, Size } from './Geometry.js';
import * as ThemeSupport from './theme_support/theme_support.js';
import * as Utils from './utils/utils.js';
import { XWidget } from './XWidget.js';
export class WidgetElement extends HTMLDivElement {
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/naming-convention, rulesdir/no_underscored_properties
    __widget;
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/naming-convention, rulesdir/no_underscored_properties
    __widgetCounter;
    constructor() {
        super();
    }
}
export class Widget {
    element;
    contentElement;
    shadowRoot;
    isWebComponent;
    visibleInternal;
    isRoot;
    isShowingInternal;
    childrenInternal;
    hideOnDetach;
    notificationDepth;
    invalidationsSuspended;
    defaultFocusedChild;
    parentWidgetInternal;
    registeredCSSFiles;
    defaultFocusedElement;
    cachedConstraints;
    constraintsInternal;
    invalidationsRequested;
    externallyManaged;
    constructor(isWebComponent, delegatesFocus) {
        this.contentElement = document.createElement('div');
        this.contentElement.classList.add('widget');
        if (isWebComponent) {
            this.element = document.createElement('div');
            this.element.classList.add('vbox');
            this.element.classList.add('flex-auto');
            this.shadowRoot = Utils.createShadowRootWithCoreStyles(this.element, {
                cssFile: undefined,
                delegatesFocus,
            });
            this.shadowRoot.appendChild(this.contentElement);
        }
        else {
            this.element = this.contentElement;
        }
        this.isWebComponent = isWebComponent;
        this.element.__widget = this;
        this.visibleInternal = false;
        this.isRoot = false;
        this.isShowingInternal = false;
        this.childrenInternal = [];
        this.hideOnDetach = false;
        this.notificationDepth = 0;
        this.invalidationsSuspended = 0;
        this.defaultFocusedChild = null;
        this.parentWidgetInternal = null;
        this.registeredCSSFiles = false;
    }
    static incrementWidgetCounter(parentElement, childElement) {
        const count = (childElement.__widgetCounter || 0) + (childElement.__widget ? 1 : 0);
        if (!count) {
            return;
        }
        let currentElement = parentElement;
        while (currentElement) {
            currentElement.__widgetCounter = (currentElement.__widgetCounter || 0) + count;
            currentElement = parentWidgetElementOrShadowHost(currentElement);
        }
    }
    static decrementWidgetCounter(parentElement, childElement) {
        const count = (childElement.__widgetCounter || 0) + (childElement.__widget ? 1 : 0);
        if (!count) {
            return;
        }
        let currentElement = parentElement;
        while (currentElement) {
            if (currentElement.__widgetCounter) {
                currentElement.__widgetCounter -= count;
            }
            currentElement = parentWidgetElementOrShadowHost(currentElement);
        }
    }
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/naming-convention
    static assert(condition, message) {
        if (!condition) {
            throw new Error(message);
        }
    }
    markAsRoot() {
        Widget.assert(!this.element.parentElement, 'Attempt to mark as root attached node');
        this.isRoot = true;
    }
    parentWidget() {
        return this.parentWidgetInternal;
    }
    children() {
        return this.childrenInternal;
    }
    childWasDetached(_widget) {
    }
    isShowing() {
        return this.isShowingInternal;
    }
    shouldHideOnDetach() {
        if (!this.element.parentElement) {
            return false;
        }
        if (this.hideOnDetach) {
            return true;
        }
        for (const child of this.childrenInternal) {
            if (child.shouldHideOnDetach()) {
                return true;
            }
        }
        return false;
    }
    setHideOnDetach() {
        this.hideOnDetach = true;
    }
    inNotification() {
        return Boolean(this.notificationDepth) ||
            Boolean(this.parentWidgetInternal && this.parentWidgetInternal.inNotification());
    }
    parentIsShowing() {
        if (this.isRoot) {
            return true;
        }
        return this.parentWidgetInternal !== null && this.parentWidgetInternal.isShowing();
    }
    callOnVisibleChildren(method) {
        const copy = this.childrenInternal.slice();
        for (let i = 0; i < copy.length; ++i) {
            if (copy[i].parentWidgetInternal === this && copy[i].visibleInternal) {
                method.call(copy[i]);
            }
        }
    }
    processWillShow() {
        this.callOnVisibleChildren(this.processWillShow);
        this.isShowingInternal = true;
    }
    processWasShown() {
        if (this.inNotification()) {
            return;
        }
        this.restoreScrollPositions();
        this.notify(this.wasShown);
        this.callOnVisibleChildren(this.processWasShown);
    }
    processWillHide() {
        if (this.inNotification()) {
            return;
        }
        this.storeScrollPositions();
        this.callOnVisibleChildren(this.processWillHide);
        this.notify(this.willHide);
        this.isShowingInternal = false;
    }
    processWasHidden() {
        this.callOnVisibleChildren(this.processWasHidden);
    }
    processOnResize() {
        if (this.inNotification()) {
            return;
        }
        if (!this.isShowing()) {
            return;
        }
        this.notify(this.onResize);
        this.callOnVisibleChildren(this.processOnResize);
    }
    notify(notification) {
        ++this.notificationDepth;
        try {
            notification.call(this);
        }
        finally {
            --this.notificationDepth;
        }
    }
    wasShown() {
    }
    willHide() {
    }
    onResize() {
    }
    onLayout() {
    }
    async ownerViewDisposed() {
    }
    show(parentElement, insertBefore) {
        Widget.assert(parentElement, 'Attempt to attach widget with no parent element');
        if (!this.isRoot) {
            // Update widget hierarchy.
            let currentParent = parentElement;
            while (currentParent && !currentParent.__widget) {
                currentParent = parentWidgetElementOrShadowHost(currentParent);
            }
            if (!currentParent || !currentParent.__widget) {
                throw new Error('Attempt to attach widget to orphan node');
            }
            this.attach(currentParent.__widget);
        }
        this.showWidgetInternal(parentElement, insertBefore);
    }
    attach(parentWidget) {
        if (parentWidget === this.parentWidgetInternal) {
            return;
        }
        if (this.parentWidgetInternal) {
            this.detach();
        }
        this.parentWidgetInternal = parentWidget;
        this.parentWidgetInternal.childrenInternal.push(this);
        this.isRoot = false;
    }
    showWidget() {
        if (this.visibleInternal) {
            return;
        }
        if (!this.element.parentElement) {
            throw new Error('Attempt to show widget that is not hidden using hideWidget().');
        }
        this.showWidgetInternal(this.element.parentElement, this.element.nextSibling);
    }
    showWidgetInternal(parentElement, insertBefore) {
        let currentParent = parentElement;
        while (currentParent && !currentParent.__widget) {
            currentParent = parentWidgetElementOrShadowHost(currentParent);
        }
        if (this.isRoot) {
            Widget.assert(!currentParent, 'Attempt to show root widget under another widget');
        }
        else {
            Widget.assert(currentParent && currentParent.__widget === this.parentWidgetInternal, 'Attempt to show under node belonging to alien widget');
        }
        const wasVisible = this.visibleInternal;
        if (wasVisible && this.element.parentElement === parentElement) {
            return;
        }
        this.visibleInternal = true;
        if (!wasVisible && this.parentIsShowing()) {
            this.processWillShow();
        }
        this.element.classList.remove('hidden');
        // Reparent
        if (this.element.parentElement !== parentElement) {
            if (!this.externallyManaged) {
                Widget.incrementWidgetCounter(parentElement, this.element);
            }
            if (insertBefore) {
                DOMExtension.DOMExtension.originalInsertBefore.call(parentElement, this.element, insertBefore);
            }
            else {
                DOMExtension.DOMExtension.originalAppendChild.call(parentElement, this.element);
            }
        }
        if (!wasVisible && this.parentIsShowing()) {
            this.processWasShown();
        }
        if (this.parentWidgetInternal && this.hasNonZeroConstraints()) {
            this.parentWidgetInternal.invalidateConstraints();
        }
        else {
            this.processOnResize();
        }
    }
    hideWidget() {
        if (!this.visibleInternal) {
            return;
        }
        this.hideWidgetInternal(false);
    }
    hideWidgetInternal(removeFromDOM) {
        this.visibleInternal = false;
        const parentElement = this.element.parentElement;
        if (this.parentIsShowing()) {
            this.processWillHide();
        }
        if (removeFromDOM) {
            // Force legal removal
            Widget.decrementWidgetCounter(parentElement, this.element);
            DOMExtension.DOMExtension.originalRemoveChild.call(parentElement, this.element);
        }
        else {
            this.element.classList.add('hidden');
        }
        if (this.parentIsShowing()) {
            this.processWasHidden();
        }
        if (this.parentWidgetInternal && this.hasNonZeroConstraints()) {
            this.parentWidgetInternal.invalidateConstraints();
        }
    }
    detach(overrideHideOnDetach) {
        if (!this.parentWidgetInternal && !this.isRoot) {
            return;
        }
        // hideOnDetach means that we should never remove element from dom - content
        // has iframes and detaching it will hurt.
        //
        // overrideHideOnDetach will override hideOnDetach and the client takes
        // responsibility for the consequences.
        const removeFromDOM = overrideHideOnDetach || !this.shouldHideOnDetach();
        if (this.visibleInternal) {
            this.hideWidgetInternal(removeFromDOM);
        }
        else if (removeFromDOM && this.element.parentElement) {
            const parentElement = this.element.parentElement;
            // Force kick out from DOM.
            Widget.decrementWidgetCounter(parentElement, this.element);
            DOMExtension.DOMExtension.originalRemoveChild.call(parentElement, this.element);
        }
        // Update widget hierarchy.
        if (this.parentWidgetInternal) {
            const childIndex = this.parentWidgetInternal.childrenInternal.indexOf(this);
            Widget.assert(childIndex >= 0, 'Attempt to remove non-child widget');
            this.parentWidgetInternal.childrenInternal.splice(childIndex, 1);
            if (this.parentWidgetInternal.defaultFocusedChild === this) {
                this.parentWidgetInternal.defaultFocusedChild = null;
            }
            this.parentWidgetInternal.childWasDetached(this);
            this.parentWidgetInternal = null;
        }
        else {
            Widget.assert(this.isRoot, 'Removing non-root widget from DOM');
        }
    }
    detachChildWidgets() {
        const children = this.childrenInternal.slice();
        for (let i = 0; i < children.length; ++i) {
            children[i].detach();
        }
    }
    elementsToRestoreScrollPositionsFor() {
        return [this.element];
    }
    storeScrollPositions() {
        const elements = this.elementsToRestoreScrollPositionsFor();
        for (const container of elements) {
            storedScrollPositions.set(container, { scrollLeft: container.scrollLeft, scrollTop: container.scrollTop });
        }
    }
    restoreScrollPositions() {
        const elements = this.elementsToRestoreScrollPositionsFor();
        for (const container of elements) {
            const storedPositions = storedScrollPositions.get(container);
            if (storedPositions) {
                container.scrollLeft = storedPositions.scrollLeft;
                container.scrollTop = storedPositions.scrollTop;
            }
        }
    }
    doResize() {
        if (!this.isShowing()) {
            return;
        }
        // No matter what notification we are in, dispatching onResize is not needed.
        if (!this.inNotification()) {
            this.callOnVisibleChildren(this.processOnResize);
        }
    }
    doLayout() {
        if (!this.isShowing()) {
            return;
        }
        this.notify(this.onLayout);
        this.doResize();
    }
    registerRequiredCSS(cssFile) {
        if (this.isWebComponent) {
            ThemeSupport.ThemeSupport.instance().appendStyle(this.shadowRoot, cssFile);
        }
        else {
            ThemeSupport.ThemeSupport.instance().appendStyle(this.element, cssFile);
        }
    }
    registerCSSFiles(cssFiles) {
        let root;
        if (this.isWebComponent && this.shadowRoot !== undefined) {
            root = this.shadowRoot;
        }
        else {
            root = Helpers.GetRootNode.getRootNode(this.contentElement);
        }
        root.adoptedStyleSheets = root.adoptedStyleSheets.concat(cssFiles);
        this.registeredCSSFiles = true;
    }
    printWidgetHierarchy() {
        const lines = [];
        this.collectWidgetHierarchy('', lines);
        console.log(lines.join('\n')); // eslint-disable-line no-console
    }
    collectWidgetHierarchy(prefix, lines) {
        lines.push(prefix + '[' + this.element.className + ']' + (this.childrenInternal.length ? ' {' : ''));
        for (let i = 0; i < this.childrenInternal.length; ++i) {
            this.childrenInternal[i].collectWidgetHierarchy(prefix + '    ', lines);
        }
        if (this.childrenInternal.length) {
            lines.push(prefix + '}');
        }
    }
    setDefaultFocusedElement(element) {
        this.defaultFocusedElement = element;
    }
    setDefaultFocusedChild(child) {
        Widget.assert(child.parentWidgetInternal === this, 'Attempt to set non-child widget as default focused.');
        this.defaultFocusedChild = child;
    }
    focus() {
        if (!this.isShowing()) {
            return;
        }
        const element = this.defaultFocusedElement;
        if (element) {
            if (!element.hasFocus()) {
                element.focus();
            }
            return;
        }
        if (this.defaultFocusedChild && this.defaultFocusedChild.visibleInternal) {
            this.defaultFocusedChild.focus();
        }
        else {
            for (const child of this.childrenInternal) {
                if (child.visibleInternal) {
                    child.focus();
                    return;
                }
            }
            let child = this.contentElement.traverseNextNode(this.contentElement);
            while (child) {
                if (child instanceof XWidget) {
                    child.focus();
                    return;
                }
                child = child.traverseNextNode(this.contentElement);
            }
        }
    }
    hasFocus() {
        return this.element.hasFocus();
    }
    calculateConstraints() {
        return new Constraints();
    }
    constraints() {
        if (typeof this.constraintsInternal !== 'undefined') {
            return this.constraintsInternal;
        }
        if (typeof this.cachedConstraints === 'undefined') {
            this.cachedConstraints = this.calculateConstraints();
        }
        return this.cachedConstraints;
    }
    setMinimumAndPreferredSizes(width, height, preferredWidth, preferredHeight) {
        this.constraintsInternal = new Constraints(new Size(width, height), new Size(preferredWidth, preferredHeight));
        this.invalidateConstraints();
    }
    setMinimumSize(width, height) {
        this.constraintsInternal = new Constraints(new Size(width, height));
        this.invalidateConstraints();
    }
    hasNonZeroConstraints() {
        const constraints = this.constraints();
        return Boolean(constraints.minimum.width || constraints.minimum.height || constraints.preferred.width ||
            constraints.preferred.height);
    }
    suspendInvalidations() {
        ++this.invalidationsSuspended;
    }
    resumeInvalidations() {
        --this.invalidationsSuspended;
        if (!this.invalidationsSuspended && this.invalidationsRequested) {
            this.invalidateConstraints();
        }
    }
    invalidateConstraints() {
        if (this.invalidationsSuspended) {
            this.invalidationsRequested = true;
            return;
        }
        this.invalidationsRequested = false;
        const cached = this.cachedConstraints;
        delete this.cachedConstraints;
        const actual = this.constraints();
        if (!actual.isEqual(cached || null) && this.parentWidgetInternal) {
            this.parentWidgetInternal.invalidateConstraints();
        }
        else {
            this.doLayout();
        }
    }
    // Excludes the widget from being tracked by its parents/ancestors via
    // widgetCounter because the widget is being handled by external code.
    // Widgets marked as being externally managed are responsible for
    // finishing out their own lifecycle (i.e. calling detach() before being
    // removed from the DOM). This is e.g. used for CodeMirror.
    //
    // Also note that this must be called before the widget is shown so that
    // so that its ancestor's widgetCounter is not incremented.
    markAsExternallyManaged() {
        Widget.assert(!this.parentWidgetInternal, 'Attempt to mark widget as externally managed after insertion to the DOM');
        this.externallyManaged = true;
    }
}
const storedScrollPositions = new WeakMap();
export class VBox extends Widget {
    constructor(isWebComponent, delegatesFocus) {
        super(isWebComponent, delegatesFocus);
        this.contentElement.classList.add('vbox');
    }
    calculateConstraints() {
        let constraints = new Constraints();
        function updateForChild() {
            const child = this.constraints();
            constraints = constraints.widthToMax(child);
            constraints = constraints.addHeight(child);
        }
        this.callOnVisibleChildren(updateForChild);
        return constraints;
    }
}
export class HBox extends Widget {
    constructor(isWebComponent) {
        super(isWebComponent);
        this.contentElement.classList.add('hbox');
    }
    calculateConstraints() {
        let constraints = new Constraints();
        function updateForChild() {
            const child = this.constraints();
            constraints = constraints.addWidth(child);
            constraints = constraints.heightToMax(child);
        }
        this.callOnVisibleChildren(updateForChild);
        return constraints;
    }
}
export class VBoxWithResizeCallback extends VBox {
    resizeCallback;
    constructor(resizeCallback) {
        super();
        this.resizeCallback = resizeCallback;
    }
    onResize() {
        this.resizeCallback();
    }
}
export class WidgetFocusRestorer {
    widget;
    previous;
    constructor(widget) {
        this.widget = widget;
        this.previous = Platform.DOMUtilities.deepActiveElement(widget.element.ownerDocument);
        widget.focus();
    }
    restore() {
        if (!this.widget) {
            return;
        }
        if (this.widget.hasFocus() && this.previous) {
            this.previous.focus();
        }
        this.previous = null;
        this.widget = null;
    }
}
function parentWidgetElementOrShadowHost(element) {
    return element.parentElementOrShadowHost();
}
//# sourceMappingURL=Widget.js.map