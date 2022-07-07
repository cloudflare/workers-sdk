// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../core/platform/platform.js';
import * as Utils from './utils/utils.js';
import { Icon } from './Icon.js';
import { deepElementFromEvent } from './UIUtils.js';
import { Widget } from './Widget.js';
import glassPaneStyles from './glassPane.css.legacy.js';
export class GlassPane {
    widgetInternal;
    element;
    contentElement;
    arrowElement;
    onMouseDownBound;
    onClickOutsideCallback;
    maxSize;
    positionX;
    positionY;
    anchorBox;
    anchorBehavior;
    sizeBehavior;
    marginBehavior;
    constructor() {
        this.widgetInternal = new Widget(true);
        this.widgetInternal.markAsRoot();
        this.element = this.widgetInternal.element;
        this.contentElement = this.widgetInternal.contentElement;
        this.arrowElement = Icon.create('', 'arrow hidden');
        if (this.element.shadowRoot) {
            this.element.shadowRoot.appendChild(this.arrowElement);
        }
        this.registerRequiredCSS(glassPaneStyles);
        this.setPointerEventsBehavior("PierceGlassPane" /* PierceGlassPane */);
        this.onMouseDownBound = this.onMouseDown.bind(this);
        this.onClickOutsideCallback = null;
        this.maxSize = null;
        this.positionX = null;
        this.positionY = null;
        this.anchorBox = null;
        this.anchorBehavior = "PreferTop" /* PreferTop */;
        this.sizeBehavior = "SetExactSize" /* SetExactSize */;
        this.marginBehavior = "DefaultMargin" /* DefaultMargin */;
    }
    isShowing() {
        return this.widgetInternal.isShowing();
    }
    registerRequiredCSS(cssFile) {
        this.widgetInternal.registerRequiredCSS(cssFile);
    }
    registerCSSFiles(cssFiles) {
        this.widgetInternal.registerCSSFiles(cssFiles);
    }
    setDefaultFocusedElement(element) {
        this.widgetInternal.setDefaultFocusedElement(element);
    }
    setDimmed(dimmed) {
        this.element.classList.toggle('dimmed-pane', dimmed);
    }
    setPointerEventsBehavior(pointerEventsBehavior) {
        this.element.classList.toggle('no-pointer-events', pointerEventsBehavior !== "BlockedByGlassPane" /* BlockedByGlassPane */);
        this.contentElement.classList.toggle('no-pointer-events', pointerEventsBehavior === "PierceContents" /* PierceContents */);
    }
    setOutsideClickCallback(callback) {
        this.onClickOutsideCallback = callback;
    }
    setMaxContentSize(size) {
        this.maxSize = size;
        this.positionContent();
    }
    setSizeBehavior(sizeBehavior) {
        this.sizeBehavior = sizeBehavior;
        this.positionContent();
    }
    setContentPosition(x, y) {
        this.positionX = x;
        this.positionY = y;
        this.positionContent();
    }
    setContentAnchorBox(anchorBox) {
        this.anchorBox = anchorBox;
        this.positionContent();
    }
    setAnchorBehavior(behavior) {
        this.anchorBehavior = behavior;
    }
    setMarginBehavior(behavior) {
        this.marginBehavior = behavior;
        this.arrowElement.classList.toggle('hidden', behavior !== "Arrow" /* Arrow */);
    }
    show(document) {
        if (this.isShowing()) {
            return;
        }
        // TODO(crbug.com/1006759): Extract the magic number
        // Deliberately starts with 3000 to hide other z-indexed elements below.
        this.element.style.zIndex = `${3000 + 1000 * _panes.size}`;
        document.body.addEventListener('mousedown', this.onMouseDownBound, true);
        document.body.addEventListener('pointerdown', this.onMouseDownBound, true);
        this.widgetInternal.show(document.body);
        _panes.add(this);
        this.positionContent();
    }
    hide() {
        if (!this.isShowing()) {
            return;
        }
        _panes.delete(this);
        this.element.ownerDocument.body.removeEventListener('mousedown', this.onMouseDownBound, true);
        this.element.ownerDocument.body.removeEventListener('pointerdown', this.onMouseDownBound, true);
        this.widgetInternal.detach();
    }
    onMouseDown(event) {
        if (!this.onClickOutsideCallback) {
            return;
        }
        const node = deepElementFromEvent(event);
        if (!node || this.contentElement.isSelfOrAncestor(node)) {
            return;
        }
        this.onClickOutsideCallback.call(null, event);
    }
    positionContent() {
        if (!this.isShowing()) {
            return;
        }
        const showArrow = this.marginBehavior === "Arrow" /* Arrow */;
        const gutterSize = showArrow ? 8 : (this.marginBehavior === "NoMargin" /* NoMargin */ ? 0 : 3);
        const scrollbarSize = Utils.measuredScrollbarWidth(this.element.ownerDocument);
        const arrowSize = 10;
        const container = (_containers.get(this.element.ownerDocument));
        if (this.sizeBehavior === "MeasureContent" /* MeasureContent */) {
            this.contentElement.positionAt(0, 0);
            this.contentElement.style.width = '';
            this.contentElement.style.maxWidth = '';
            this.contentElement.style.height = '';
            this.contentElement.style.maxHeight = '';
        }
        const containerWidth = container.offsetWidth;
        const containerHeight = container.offsetHeight;
        let width = containerWidth - gutterSize * 2;
        let height = containerHeight - gutterSize * 2;
        let positionX = gutterSize;
        let positionY = gutterSize;
        if (this.maxSize) {
            width = Math.min(width, this.maxSize.width);
            height = Math.min(height, this.maxSize.height);
        }
        if (this.sizeBehavior === "MeasureContent" /* MeasureContent */) {
            const measuredRect = this.contentElement.getBoundingClientRect();
            const widthOverflow = height < measuredRect.height ? scrollbarSize : 0;
            const heightOverflow = width < measuredRect.width ? scrollbarSize : 0;
            width = Math.min(width, measuredRect.width + widthOverflow);
            height = Math.min(height, measuredRect.height + heightOverflow);
        }
        if (this.anchorBox) {
            const anchorBox = this.anchorBox.relativeToElement(container);
            let behavior = this.anchorBehavior;
            this.arrowElement.classList.remove('arrow-none', 'arrow-top', 'arrow-bottom', 'arrow-left', 'arrow-right');
            if (behavior === "PreferTop" /* PreferTop */ || behavior === "PreferBottom" /* PreferBottom */) {
                const top = anchorBox.y - 2 * gutterSize;
                const bottom = containerHeight - anchorBox.y - anchorBox.height - 2 * gutterSize;
                if (behavior === "PreferTop" /* PreferTop */ && top < height && bottom > top) {
                    behavior = "PreferBottom" /* PreferBottom */;
                }
                if (behavior === "PreferBottom" /* PreferBottom */ && bottom < height && top > bottom) {
                    behavior = "PreferTop" /* PreferTop */;
                }
                let arrowY;
                let enoughHeight = true;
                if (behavior === "PreferTop" /* PreferTop */) {
                    positionY = Math.max(gutterSize, anchorBox.y - height - gutterSize);
                    const spaceTop = anchorBox.y - positionY - gutterSize;
                    if (this.sizeBehavior === "MeasureContent" /* MeasureContent */) {
                        if (height > spaceTop) {
                            this.arrowElement.classList.add('arrow-none');
                            enoughHeight = false;
                        }
                    }
                    else {
                        height = Math.min(height, spaceTop);
                    }
                    this.arrowElement.setIconType('mediumicon-arrow-bottom');
                    this.arrowElement.classList.add('arrow-bottom');
                    arrowY = anchorBox.y - gutterSize;
                }
                else {
                    positionY = anchorBox.y + anchorBox.height + gutterSize;
                    const spaceBottom = containerHeight - positionY - gutterSize;
                    if (this.sizeBehavior === "MeasureContent" /* MeasureContent */) {
                        if (height > spaceBottom) {
                            this.arrowElement.classList.add('arrow-none');
                            positionY = containerHeight - gutterSize - height;
                            enoughHeight = false;
                        }
                    }
                    else {
                        height = Math.min(height, spaceBottom);
                    }
                    this.arrowElement.setIconType('mediumicon-arrow-top');
                    this.arrowElement.classList.add('arrow-top');
                    arrowY = anchorBox.y + anchorBox.height + gutterSize;
                }
                positionX = Math.max(gutterSize, Math.min(anchorBox.x, containerWidth - width - gutterSize));
                if (!enoughHeight) {
                    positionX = Math.min(positionX + arrowSize, containerWidth - width - gutterSize);
                }
                else if (showArrow && positionX - arrowSize >= gutterSize) {
                    positionX -= arrowSize;
                }
                width = Math.min(width, containerWidth - positionX - gutterSize);
                if (2 * arrowSize >= width) {
                    this.arrowElement.classList.add('arrow-none');
                }
                else {
                    let arrowX = anchorBox.x + Math.min(50, Math.floor(anchorBox.width / 2));
                    arrowX = Platform.NumberUtilities.clamp(arrowX, positionX + arrowSize, positionX + width - arrowSize);
                    this.arrowElement.positionAt(arrowX, arrowY, container);
                }
            }
            else {
                const left = anchorBox.x - 2 * gutterSize;
                const right = containerWidth - anchorBox.x - anchorBox.width - 2 * gutterSize;
                if (behavior === "PreferLeft" /* PreferLeft */ && left < width && right > left) {
                    behavior = "PreferRight" /* PreferRight */;
                }
                if (behavior === "PreferRight" /* PreferRight */ && right < width && left > right) {
                    behavior = "PreferLeft" /* PreferLeft */;
                }
                let arrowX;
                let enoughWidth = true;
                if (behavior === "PreferLeft" /* PreferLeft */) {
                    positionX = Math.max(gutterSize, anchorBox.x - width - gutterSize);
                    const spaceLeft = anchorBox.x - positionX - gutterSize;
                    if (this.sizeBehavior === "MeasureContent" /* MeasureContent */) {
                        if (width > spaceLeft) {
                            this.arrowElement.classList.add('arrow-none');
                            enoughWidth = false;
                        }
                    }
                    else {
                        width = Math.min(width, spaceLeft);
                    }
                    this.arrowElement.setIconType('mediumicon-arrow-right');
                    this.arrowElement.classList.add('arrow-right');
                    arrowX = anchorBox.x - gutterSize;
                }
                else {
                    positionX = anchorBox.x + anchorBox.width + gutterSize;
                    const spaceRight = containerWidth - positionX - gutterSize;
                    if (this.sizeBehavior === "MeasureContent" /* MeasureContent */) {
                        if (width > spaceRight) {
                            this.arrowElement.classList.add('arrow-none');
                            positionX = containerWidth - gutterSize - width;
                            enoughWidth = false;
                        }
                    }
                    else {
                        width = Math.min(width, spaceRight);
                    }
                    this.arrowElement.setIconType('mediumicon-arrow-left');
                    this.arrowElement.classList.add('arrow-left');
                    arrowX = anchorBox.x + anchorBox.width + gutterSize;
                }
                positionY = Math.max(gutterSize, Math.min(anchorBox.y, containerHeight - height - gutterSize));
                if (!enoughWidth) {
                    positionY = Math.min(positionY + arrowSize, containerHeight - height - gutterSize);
                }
                else if (showArrow && positionY - arrowSize >= gutterSize) {
                    positionY -= arrowSize;
                }
                height = Math.min(height, containerHeight - positionY - gutterSize);
                if (2 * arrowSize >= height) {
                    this.arrowElement.classList.add('arrow-none');
                }
                else {
                    let arrowY = anchorBox.y + Math.min(50, Math.floor(anchorBox.height / 2));
                    arrowY = Platform.NumberUtilities.clamp(arrowY, positionY + arrowSize, positionY + height - arrowSize);
                    this.arrowElement.positionAt(arrowX, arrowY, container);
                }
            }
        }
        else {
            positionX = this.positionX !== null ? this.positionX : (containerWidth - width) / 2;
            positionY = this.positionY !== null ? this.positionY : (containerHeight - height) / 2;
            width = Math.min(width, containerWidth - positionX - gutterSize);
            height = Math.min(height, containerHeight - positionY - gutterSize);
            this.arrowElement.classList.add('arrow-none');
        }
        this.contentElement.style.width = width + 'px';
        if (this.sizeBehavior === "SetExactWidthMaxHeight" /* SetExactWidthMaxHeight */) {
            this.contentElement.style.maxHeight = height + 'px';
        }
        else {
            this.contentElement.style.height = height + 'px';
        }
        this.contentElement.positionAt(positionX, positionY, container);
        this.widgetInternal.doResize();
    }
    widget() {
        return this.widgetInternal;
    }
    static setContainer(element) {
        _containers.set(element.ownerDocument, element);
        GlassPane.containerMoved(element);
    }
    static container(document) {
        return _containers.get(document);
    }
    static containerMoved(element) {
        for (const pane of _panes) {
            if (pane.isShowing() && pane.element.ownerDocument === element.ownerDocument) {
                pane.positionContent();
            }
        }
    }
}
// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
// eslint-disable-next-line @typescript-eslint/naming-convention
const _containers = new Map();
// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
// eslint-disable-next-line @typescript-eslint/naming-convention
const _panes = new Set();
// Exported for layout tests.
export const GlassPanePanes = _panes;
//# sourceMappingURL=GlassPane.js.map