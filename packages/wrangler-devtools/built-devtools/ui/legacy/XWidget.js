// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as ComponentHelpers from '../components/helpers/helpers.js';
import { XElement } from './XElement.js';
let observer = null;
const storedScrollPositions = new WeakMap();
export class XWidget extends XElement {
    visible;
    shadowRootInternal;
    defaultFocusedElement;
    elementsToRestoreScrollPositionsFor;
    onShownCallback;
    onHiddenCallback;
    onResizedCallback;
    constructor() {
        super();
        this.style.setProperty('display', 'flex');
        this.style.setProperty('flex-direction', 'column');
        this.style.setProperty('align-items', 'stretch');
        this.style.setProperty('justify-content', 'flex-start');
        this.style.setProperty('contain', 'layout style');
        this.visible = false;
        this.defaultFocusedElement = null;
        this.elementsToRestoreScrollPositionsFor = [];
        if (!observer) {
            observer = new ResizeObserver(entries => {
                for (const entry of entries) {
                    const widget = entry.target;
                    if (widget.visible && widget.onResizedCallback) {
                        widget.onResizedCallback.call(null);
                    }
                }
            });
        }
        observer.observe(this);
        this.setElementsToRestoreScrollPositionsFor([this]);
    }
    isShowing() {
        return this.visible;
    }
    setOnShown(callback) {
        this.onShownCallback = callback;
    }
    setOnHidden(callback) {
        this.onHiddenCallback = callback;
    }
    setOnResized(callback) {
        this.onResizedCallback = callback;
    }
    setElementsToRestoreScrollPositionsFor(elements) {
        for (const element of this.elementsToRestoreScrollPositionsFor) {
            element.removeEventListener('scroll', XWidget.storeScrollPosition, { capture: false });
        }
        this.elementsToRestoreScrollPositionsFor = elements;
        for (const element of this.elementsToRestoreScrollPositionsFor) {
            element.addEventListener('scroll', XWidget.storeScrollPosition, { passive: true, capture: false });
        }
    }
    restoreScrollPositions() {
        for (const element of this.elementsToRestoreScrollPositionsFor) {
            const storedPositions = storedScrollPositions.get(element);
            if (storedPositions) {
                element.scrollTop = storedPositions.scrollTop;
                element.scrollLeft = storedPositions.scrollLeft;
            }
        }
    }
    static storeScrollPosition(event) {
        const element = event.currentTarget;
        storedScrollPositions.set(element, { scrollLeft: element.scrollLeft, scrollTop: element.scrollTop });
    }
    setDefaultFocusedElement(element) {
        if (element && !this.isSelfOrAncestor(element)) {
            throw new Error('Default focus must be descendant');
        }
        this.defaultFocusedElement = element;
    }
    focus() {
        if (!this.visible) {
            return;
        }
        let element;
        if (this.defaultFocusedElement && this.isSelfOrAncestor(this.defaultFocusedElement)) {
            element = this.defaultFocusedElement;
        }
        else if (this.tabIndex !== -1) {
            element = this;
        }
        else {
            let child = this.traverseNextNode(this);
            while (child) {
                if ((child instanceof XWidget) && child.visible) {
                    element = child;
                    break;
                }
                child = child.traverseNextNode(this);
            }
        }
        if (!element || element.hasFocus()) {
            return;
        }
        if (element === this) {
            HTMLElement.prototype.focus.call(this);
        }
        else {
            element.focus();
        }
    }
    connectedCallback() {
        this.visible = true;
        this.restoreScrollPositions();
        if (this.onShownCallback) {
            this.onShownCallback.call(null);
        }
    }
    disconnectedCallback() {
        this.visible = false;
        if (this.onHiddenCallback) {
            this.onHiddenCallback.call(null);
        }
    }
}
ComponentHelpers.CustomElements.defineComponent('x-widget', XWidget);
//# sourceMappingURL=XWidget.js.map