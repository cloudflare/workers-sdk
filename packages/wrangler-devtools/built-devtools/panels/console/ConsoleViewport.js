/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
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
import * as Platform from '../../core/platform/platform.js';
import * as Components from '../../ui/legacy/components/utils/utils.js';
import * as UI from '../../ui/legacy/legacy.js';
export class ConsoleViewport {
    element;
    topGapElement;
    topGapElementActive;
    contentElementInternal;
    bottomGapElement;
    bottomGapElementActive;
    provider;
    virtualSelectedIndex;
    firstActiveIndex;
    lastActiveIndex;
    renderedItems;
    anchorSelection;
    headSelection;
    itemCount;
    cumulativeHeights;
    muteCopyHandler;
    observer;
    observerConfig;
    stickToBottomInternal;
    selectionIsBackward;
    lastSelectedElement;
    cachedProviderElements;
    constructor(provider) {
        this.element = document.createElement('div');
        this.element.style.overflow = 'auto';
        this.topGapElement = this.element.createChild('div');
        this.topGapElement.style.height = '0px';
        this.topGapElement.style.color = 'transparent';
        this.topGapElementActive = false;
        this.contentElementInternal = this.element.createChild('div');
        this.bottomGapElement = this.element.createChild('div');
        this.bottomGapElement.style.height = '0px';
        this.bottomGapElement.style.color = 'transparent';
        this.bottomGapElementActive = false;
        // Text content needed for range intersection checks in updateSelectionModel.
        // Use Unicode ZERO WIDTH NO-BREAK SPACE, which avoids contributing any height to the element's layout overflow.
        this.topGapElement.textContent = '\uFEFF';
        this.bottomGapElement.textContent = '\uFEFF';
        UI.ARIAUtils.markAsHidden(this.topGapElement);
        UI.ARIAUtils.markAsHidden(this.bottomGapElement);
        this.provider = provider;
        this.element.addEventListener('scroll', this.onScroll.bind(this), false);
        this.element.addEventListener('copy', this.onCopy.bind(this), false);
        this.element.addEventListener('dragstart', this.onDragStart.bind(this), false);
        this.contentElementInternal.addEventListener('focusin', this.onFocusIn.bind(this), false);
        this.contentElementInternal.addEventListener('focusout', this.onFocusOut.bind(this), false);
        this.contentElementInternal.addEventListener('keydown', this.onKeyDown.bind(this), false);
        this.virtualSelectedIndex = -1;
        this.contentElementInternal.tabIndex = -1;
        this.firstActiveIndex = -1;
        this.lastActiveIndex = -1;
        this.renderedItems = [];
        this.anchorSelection = null;
        this.headSelection = null;
        this.itemCount = 0;
        this.cumulativeHeights = new Int32Array(0);
        this.muteCopyHandler = false;
        // Listen for any changes to descendants and trigger a refresh. This ensures
        // that items updated asynchronously will not break stick-to-bottom behavior
        // if they change the scroll height.
        this.observer = new MutationObserver(this.refresh.bind(this));
        this.observerConfig = { childList: true, subtree: true };
        this.stickToBottomInternal = false;
        this.selectionIsBackward = false;
    }
    stickToBottom() {
        return this.stickToBottomInternal;
    }
    setStickToBottom(value) {
        this.stickToBottomInternal = value;
        if (this.stickToBottomInternal) {
            this.observer.observe(this.contentElementInternal, this.observerConfig);
        }
        else {
            this.observer.disconnect();
        }
    }
    hasVirtualSelection() {
        return this.virtualSelectedIndex !== -1;
    }
    copyWithStyles() {
        this.muteCopyHandler = true;
        this.element.ownerDocument.execCommand('copy');
        this.muteCopyHandler = false;
    }
    onCopy(event) {
        if (this.muteCopyHandler) {
            return;
        }
        const text = this.selectedText();
        if (!text) {
            return;
        }
        event.preventDefault();
        if (this.selectionContainsTable()) {
            this.copyWithStyles();
        }
        else if (event.clipboardData) {
            event.clipboardData.setData('text/plain', text);
        }
    }
    onFocusIn(event) {
        const renderedIndex = this.renderedItems.findIndex(item => item.element().isSelfOrAncestor(event.target));
        if (renderedIndex !== -1) {
            this.virtualSelectedIndex = this.firstActiveIndex + renderedIndex;
        }
        let focusLastChild = false;
        // Make default selection when moving from external (e.g. prompt) to the container.
        if (this.virtualSelectedIndex === -1 && this.isOutsideViewport(event.relatedTarget) &&
            event.target === this.contentElementInternal && this.itemCount) {
            focusLastChild = true;
            this.virtualSelectedIndex = this.itemCount - 1;
            // Update stick to bottom before scrolling into view.
            this.refresh();
            this.scrollItemIntoView(this.virtualSelectedIndex);
        }
        this.updateFocusedItem(focusLastChild);
    }
    onFocusOut(event) {
        if (this.isOutsideViewport(event.relatedTarget)) {
            this.virtualSelectedIndex = -1;
        }
        this.updateFocusedItem();
    }
    isOutsideViewport(element) {
        return element !== null && !element.isSelfOrDescendant(this.contentElementInternal);
    }
    onDragStart(event) {
        const text = this.selectedText();
        if (!text) {
            return false;
        }
        if (event.dataTransfer) {
            event.dataTransfer.clearData();
            event.dataTransfer.setData('text/plain', text);
            event.dataTransfer.effectAllowed = 'copy';
        }
        return true;
    }
    onKeyDown(event) {
        if (UI.UIUtils.isEditing() || !this.itemCount || event.shiftKey) {
            return;
        }
        let isArrowUp = false;
        switch (event.key) {
            case 'ArrowUp':
                if (this.virtualSelectedIndex > 0) {
                    isArrowUp = true;
                    this.virtualSelectedIndex--;
                }
                else {
                    return;
                }
                break;
            case 'ArrowDown':
                if (this.virtualSelectedIndex < this.itemCount - 1) {
                    this.virtualSelectedIndex++;
                }
                else {
                    return;
                }
                break;
            case 'Home':
                this.virtualSelectedIndex = 0;
                break;
            case 'End':
                this.virtualSelectedIndex = this.itemCount - 1;
                break;
            default:
                return;
        }
        event.consume(true);
        this.scrollItemIntoView(this.virtualSelectedIndex);
        this.updateFocusedItem(isArrowUp);
    }
    updateFocusedItem(focusLastChild) {
        const selectedElement = this.renderedElementAt(this.virtualSelectedIndex);
        const changed = this.lastSelectedElement !== selectedElement;
        const containerHasFocus = this.contentElementInternal === Platform.DOMUtilities.deepActiveElement(this.element.ownerDocument);
        if (this.lastSelectedElement && changed) {
            this.lastSelectedElement.classList.remove('console-selected');
        }
        if (selectedElement && (focusLastChild || changed || containerHasFocus) && this.element.hasFocus()) {
            selectedElement.classList.add('console-selected');
            // Do not focus the message if something within holds focus (e.g. object).
            if (focusLastChild) {
                this.setStickToBottom(false);
                this.renderedItems[this.virtualSelectedIndex - this.firstActiveIndex].focusLastChildOrSelf();
            }
            else if (!selectedElement.hasFocus()) {
                selectedElement.focus({ preventScroll: true });
            }
        }
        if (this.itemCount && !this.contentElementInternal.hasFocus()) {
            this.contentElementInternal.tabIndex = 0;
        }
        else {
            this.contentElementInternal.tabIndex = -1;
        }
        this.lastSelectedElement = selectedElement;
    }
    contentElement() {
        return this.contentElementInternal;
    }
    invalidate() {
        delete this.cachedProviderElements;
        this.itemCount = this.provider.itemCount();
        if (this.virtualSelectedIndex > this.itemCount - 1) {
            this.virtualSelectedIndex = this.itemCount - 1;
        }
        this.rebuildCumulativeHeights();
        this.refresh();
    }
    providerElement(index) {
        if (!this.cachedProviderElements) {
            this.cachedProviderElements = new Array(this.itemCount);
        }
        let element = this.cachedProviderElements[index];
        if (!element) {
            element = this.provider.itemElement(index);
            this.cachedProviderElements[index] = element;
        }
        return element;
    }
    rebuildCumulativeHeights() {
        const firstActiveIndex = this.firstActiveIndex;
        const lastActiveIndex = this.lastActiveIndex;
        let height = 0;
        this.cumulativeHeights = new Int32Array(this.itemCount);
        for (let i = 0; i < this.itemCount; ++i) {
            if (firstActiveIndex <= i && i - firstActiveIndex < this.renderedItems.length && i <= lastActiveIndex) {
                height += this.renderedItems[i - firstActiveIndex].element().offsetHeight;
            }
            else {
                height += this.provider.fastHeight(i);
            }
            this.cumulativeHeights[i] = height;
        }
    }
    rebuildCumulativeHeightsIfNeeded() {
        let totalCachedHeight = 0;
        let totalMeasuredHeight = 0;
        // Check whether current items in DOM have changed heights. Tolerate 1-pixel
        // error due to double-to-integer rounding errors.
        for (let i = 0; i < this.renderedItems.length; ++i) {
            const cachedItemHeight = this.cachedItemHeight(this.firstActiveIndex + i);
            const measuredHeight = this.renderedItems[i].element().offsetHeight;
            if (Math.abs(cachedItemHeight - measuredHeight) > 1) {
                this.rebuildCumulativeHeights();
                return;
            }
            totalMeasuredHeight += measuredHeight;
            totalCachedHeight += cachedItemHeight;
            if (Math.abs(totalCachedHeight - totalMeasuredHeight) > 1) {
                this.rebuildCumulativeHeights();
                return;
            }
        }
    }
    cachedItemHeight(index) {
        return index === 0 ? this.cumulativeHeights[0] : this.cumulativeHeights[index] - this.cumulativeHeights[index - 1];
    }
    isSelectionBackwards(selection) {
        if (!selection || !selection.rangeCount || !selection.anchorNode || !selection.focusNode) {
            return false;
        }
        const range = document.createRange();
        range.setStart(selection.anchorNode, selection.anchorOffset);
        range.setEnd(selection.focusNode, selection.focusOffset);
        return range.collapsed;
    }
    createSelectionModel(itemIndex, node, offset) {
        return { item: itemIndex, node: node, offset: offset };
    }
    updateSelectionModel(selection) {
        const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
        if (!range || (!selection || selection.isCollapsed) || !this.element.hasSelection()) {
            this.headSelection = null;
            this.anchorSelection = null;
            return false;
        }
        let firstSelectedIndex = Number.MAX_VALUE;
        let lastSelectedIndex = -1;
        let hasVisibleSelection = false;
        for (let i = 0; i < this.renderedItems.length; ++i) {
            if (range.intersectsNode(this.renderedItems[i].element())) {
                const index = i + this.firstActiveIndex;
                firstSelectedIndex = Math.min(firstSelectedIndex, index);
                lastSelectedIndex = Math.max(lastSelectedIndex, index);
                hasVisibleSelection = true;
            }
        }
        const topOverlap = range.intersectsNode(this.topGapElement) && this.topGapElementActive;
        const bottomOverlap = range.intersectsNode(this.bottomGapElement) && this.bottomGapElementActive;
        if (!topOverlap && !bottomOverlap && !hasVisibleSelection) {
            this.headSelection = null;
            this.anchorSelection = null;
            return false;
        }
        if (!this.anchorSelection || !this.headSelection) {
            this.anchorSelection = this.createSelectionModel(0, this.element, 0);
            this.headSelection = this.createSelectionModel(this.itemCount - 1, this.element, this.element.children.length);
            this.selectionIsBackward = false;
        }
        const isBackward = this.isSelectionBackwards(selection);
        const startSelection = this.selectionIsBackward ? this.headSelection : this.anchorSelection;
        const endSelection = this.selectionIsBackward ? this.anchorSelection : this.headSelection;
        let firstSelected = null;
        let lastSelected = null;
        if (hasVisibleSelection) {
            firstSelected = this.createSelectionModel(firstSelectedIndex, range.startContainer, range.startOffset);
            lastSelected = this.createSelectionModel(lastSelectedIndex, range.endContainer, range.endOffset);
        }
        if (topOverlap && bottomOverlap && hasVisibleSelection) {
            firstSelected = (firstSelected && firstSelected.item < startSelection.item) ? firstSelected : startSelection;
            lastSelected = (lastSelected && lastSelected.item > endSelection.item) ? lastSelected : endSelection;
        }
        else if (!hasVisibleSelection) {
            firstSelected = startSelection;
            lastSelected = endSelection;
        }
        else if (topOverlap) {
            firstSelected = isBackward ? this.headSelection : this.anchorSelection;
        }
        else if (bottomOverlap) {
            lastSelected = isBackward ? this.anchorSelection : this.headSelection;
        }
        if (isBackward) {
            this.anchorSelection = lastSelected;
            this.headSelection = firstSelected;
        }
        else {
            this.anchorSelection = firstSelected;
            this.headSelection = lastSelected;
        }
        this.selectionIsBackward = isBackward;
        return true;
    }
    restoreSelection(selection) {
        if (!selection || !this.anchorSelection || !this.headSelection) {
            return;
        }
        const clampSelection = (selection, isSelectionBackwards) => {
            if (this.firstActiveIndex <= selection.item && selection.item <= this.lastActiveIndex) {
                return { element: selection.node, offset: selection.offset };
            }
            const element = selection.item < this.firstActiveIndex ? this.topGapElement : this.bottomGapElement;
            return { element, offset: isSelectionBackwards ? 1 : 0 };
        };
        const { element: anchorElement, offset: anchorOffset } = clampSelection(this.anchorSelection, Boolean(this.selectionIsBackward));
        const { element: headElement, offset: headOffset } = clampSelection(this.headSelection, !this.selectionIsBackward);
        selection.setBaseAndExtent(anchorElement, anchorOffset, headElement, headOffset);
    }
    selectionContainsTable() {
        if (!this.anchorSelection || !this.headSelection) {
            return false;
        }
        const start = this.selectionIsBackward ? this.headSelection.item : this.anchorSelection.item;
        const end = this.selectionIsBackward ? this.anchorSelection.item : this.headSelection.item;
        for (let i = start; i <= end; i++) {
            const element = this.providerElement(i);
            if (element && element.consoleMessage().type === 'table') {
                return true;
            }
        }
        return false;
    }
    refresh() {
        this.observer.disconnect();
        this.innerRefresh();
        if (this.stickToBottomInternal) {
            this.observer.observe(this.contentElementInternal, this.observerConfig);
        }
    }
    innerRefresh() {
        if (!this.visibleHeight()) {
            return;
        } // Do nothing for invisible controls.
        if (!this.itemCount) {
            for (let i = 0; i < this.renderedItems.length; ++i) {
                this.renderedItems[i].willHide();
            }
            this.renderedItems = [];
            this.contentElementInternal.removeChildren();
            this.topGapElement.style.height = '0px';
            this.bottomGapElement.style.height = '0px';
            this.firstActiveIndex = -1;
            this.lastActiveIndex = -1;
            this.updateFocusedItem();
            return;
        }
        const selection = this.element.getComponentSelection();
        const shouldRestoreSelection = this.updateSelectionModel(selection);
        const visibleFrom = this.element.scrollTop;
        const visibleHeight = this.visibleHeight();
        const activeHeight = visibleHeight * 2;
        this.rebuildCumulativeHeightsIfNeeded();
        // When the viewport is scrolled to the bottom, using the cumulative heights estimate is not
        // precise enough to determine next visible indices. This stickToBottom check avoids extra
        // calls to refresh in those cases.
        if (this.stickToBottomInternal) {
            this.firstActiveIndex = Math.max(this.itemCount - Math.ceil(activeHeight / this.provider.minimumRowHeight()), 0);
            this.lastActiveIndex = this.itemCount - 1;
        }
        else {
            this.firstActiveIndex = Math.max(Platform.ArrayUtilities.lowerBound(this.cumulativeHeights, visibleFrom + 1 - (activeHeight - visibleHeight) / 2, Platform.ArrayUtilities.DEFAULT_COMPARATOR), 0);
            // Proactively render more rows in case some of them will be collapsed without triggering refresh. @see crbug.com/390169
            this.lastActiveIndex = this.firstActiveIndex + Math.ceil(activeHeight / this.provider.minimumRowHeight()) - 1;
            this.lastActiveIndex = Math.min(this.lastActiveIndex, this.itemCount - 1);
        }
        const topGapHeight = this.cumulativeHeights[this.firstActiveIndex - 1] || 0;
        const bottomGapHeight = this.cumulativeHeights[this.cumulativeHeights.length - 1] - this.cumulativeHeights[this.lastActiveIndex];
        function prepare() {
            this.topGapElement.style.height = topGapHeight + 'px';
            this.bottomGapElement.style.height = bottomGapHeight + 'px';
            this.topGapElementActive = Boolean(topGapHeight);
            this.bottomGapElementActive = Boolean(bottomGapHeight);
            this.contentElementInternal.style.setProperty('height', '10000000px');
        }
        this.partialViewportUpdate(prepare.bind(this));
        this.contentElementInternal.style.removeProperty('height');
        // Should be the last call in the method as it might force layout.
        if (shouldRestoreSelection) {
            this.restoreSelection(selection);
        }
        if (this.stickToBottomInternal) {
            this.element.scrollTop = 10000000;
        }
    }
    partialViewportUpdate(prepare) {
        const itemsToRender = new Set();
        for (let i = this.firstActiveIndex; i <= this.lastActiveIndex; ++i) {
            const providerElement = this.providerElement(i);
            console.assert(Boolean(providerElement), 'Expected provider element to be defined');
            if (providerElement) {
                itemsToRender.add(providerElement);
            }
        }
        const willBeHidden = this.renderedItems.filter(item => !itemsToRender.has(item));
        for (let i = 0; i < willBeHidden.length; ++i) {
            willBeHidden[i].willHide();
        }
        prepare();
        let hadFocus = false;
        for (let i = 0; i < willBeHidden.length; ++i) {
            hadFocus = hadFocus || willBeHidden[i].element().hasFocus();
            willBeHidden[i].element().remove();
        }
        const wasShown = [];
        let anchor = this.contentElementInternal.firstChild;
        for (const viewportElement of itemsToRender) {
            const element = viewportElement.element();
            if (element !== anchor) {
                const shouldCallWasShown = !element.parentElement;
                if (shouldCallWasShown) {
                    wasShown.push(viewportElement);
                }
                this.contentElementInternal.insertBefore(element, anchor);
            }
            else {
                anchor = anchor.nextSibling;
            }
        }
        for (let i = 0; i < wasShown.length; ++i) {
            wasShown[i].wasShown();
        }
        this.renderedItems = Array.from(itemsToRender);
        if (hadFocus) {
            this.contentElementInternal.focus();
        }
        this.updateFocusedItem();
    }
    selectedText() {
        this.updateSelectionModel(this.element.getComponentSelection());
        if (!this.headSelection || !this.anchorSelection) {
            return null;
        }
        let startSelection = null;
        let endSelection = null;
        if (this.selectionIsBackward) {
            startSelection = this.headSelection;
            endSelection = this.anchorSelection;
        }
        else {
            startSelection = this.anchorSelection;
            endSelection = this.headSelection;
        }
        const textLines = [];
        for (let i = startSelection.item; i <= endSelection.item; ++i) {
            const providerElement = this.providerElement(i);
            console.assert(Boolean(providerElement));
            if (!providerElement) {
                continue;
            }
            const element = providerElement.element();
            const lineContent = element.childTextNodes().map(Components.Linkifier.Linkifier.untruncatedNodeText).join('');
            textLines.push(lineContent);
        }
        const endProviderElement = this.providerElement(endSelection.item);
        const endSelectionElement = endProviderElement && endProviderElement.element();
        if (endSelectionElement && endSelection.node && endSelection.node.isSelfOrDescendant(endSelectionElement)) {
            const itemTextOffset = this.textOffsetInNode(endSelectionElement, endSelection.node, endSelection.offset);
            if (textLines.length > 0) {
                textLines[textLines.length - 1] = textLines[textLines.length - 1].substring(0, itemTextOffset);
            }
        }
        const startProviderElement = this.providerElement(startSelection.item);
        const startSelectionElement = startProviderElement && startProviderElement.element();
        if (startSelectionElement && startSelection.node && startSelection.node.isSelfOrDescendant(startSelectionElement)) {
            const itemTextOffset = this.textOffsetInNode(startSelectionElement, startSelection.node, startSelection.offset);
            textLines[0] = textLines[0].substring(itemTextOffset);
        }
        return textLines.join('\n');
    }
    textOffsetInNode(itemElement, selectionNode, offset) {
        // If the selectionNode is not a TextNode, we may need to convert a child offset into a character offset.
        const textContentLength = selectionNode.textContent ? selectionNode.textContent.length : 0;
        if (selectionNode.nodeType !== Node.TEXT_NODE) {
            if (offset < selectionNode.childNodes.length) {
                selectionNode = selectionNode.childNodes.item(offset);
                offset = 0;
            }
            else {
                offset = textContentLength;
            }
        }
        let chars = 0;
        let node = itemElement;
        while ((node = node.traverseNextNode(itemElement)) && node !== selectionNode) {
            if (node.nodeType !== Node.TEXT_NODE ||
                (node.parentElement &&
                    (node.parentElement.nodeName === 'STYLE' || node.parentElement.nodeName === 'SCRIPT'))) {
                continue;
            }
            chars += Components.Linkifier.Linkifier.untruncatedNodeText(node).length;
        }
        // If the selected node text was truncated, treat any non-zero offset as the full length.
        const untruncatedContainerLength = Components.Linkifier.Linkifier.untruncatedNodeText(selectionNode).length;
        if (offset > 0 && untruncatedContainerLength !== textContentLength) {
            offset = untruncatedContainerLength;
        }
        return chars + offset;
    }
    onScroll(_event) {
        this.refresh();
    }
    firstVisibleIndex() {
        if (!this.cumulativeHeights.length) {
            return -1;
        }
        this.rebuildCumulativeHeightsIfNeeded();
        return Platform.ArrayUtilities.lowerBound(this.cumulativeHeights, this.element.scrollTop + 1, Platform.ArrayUtilities.DEFAULT_COMPARATOR);
    }
    lastVisibleIndex() {
        if (!this.cumulativeHeights.length) {
            return -1;
        }
        this.rebuildCumulativeHeightsIfNeeded();
        const scrollBottom = this.element.scrollTop + this.element.clientHeight;
        const right = this.itemCount - 1;
        return Platform.ArrayUtilities.lowerBound(this.cumulativeHeights, scrollBottom, Platform.ArrayUtilities.DEFAULT_COMPARATOR, undefined, right);
    }
    renderedElementAt(index) {
        if (index === -1 || index < this.firstActiveIndex || index > this.lastActiveIndex) {
            return null;
        }
        return this.renderedItems[index - this.firstActiveIndex].element();
    }
    scrollItemIntoView(index, makeLast) {
        const firstVisibleIndex = this.firstVisibleIndex();
        const lastVisibleIndex = this.lastVisibleIndex();
        if (index > firstVisibleIndex && index < lastVisibleIndex) {
            return;
        }
        // If the prompt is visible, then the last item must be fully on screen.
        if (index === lastVisibleIndex && this.cumulativeHeights[index] <= this.element.scrollTop + this.visibleHeight()) {
            return;
        }
        if (makeLast) {
            this.forceScrollItemToBeLast(index);
        }
        else if (index <= firstVisibleIndex) {
            this.forceScrollItemToBeFirst(index);
        }
        else if (index >= lastVisibleIndex) {
            this.forceScrollItemToBeLast(index);
        }
    }
    forceScrollItemToBeFirst(index) {
        console.assert(index >= 0 && index < this.itemCount, 'Cannot scroll item at invalid index');
        this.setStickToBottom(false);
        this.rebuildCumulativeHeightsIfNeeded();
        this.element.scrollTop = index > 0 ? this.cumulativeHeights[index - 1] : 0;
        if (UI.UIUtils.isScrolledToBottom(this.element)) {
            this.setStickToBottom(true);
        }
        this.refresh();
        // After refresh, the item is in DOM, but may not be visible (items above were larger than expected).
        const renderedElement = this.renderedElementAt(index);
        if (renderedElement) {
            renderedElement.scrollIntoView(true /* alignTop */);
        }
    }
    forceScrollItemToBeLast(index) {
        console.assert(index >= 0 && index < this.itemCount, 'Cannot scroll item at invalid index');
        this.setStickToBottom(false);
        this.rebuildCumulativeHeightsIfNeeded();
        this.element.scrollTop = this.cumulativeHeights[index] - this.visibleHeight();
        if (UI.UIUtils.isScrolledToBottom(this.element)) {
            this.setStickToBottom(true);
        }
        this.refresh();
        // After refresh, the item is in DOM, but may not be visible (items above were larger than expected).
        const renderedElement = this.renderedElementAt(index);
        if (renderedElement) {
            renderedElement.scrollIntoView(false /* alignTop */);
        }
    }
    visibleHeight() {
        // Use offsetHeight instead of clientHeight to avoid being affected by horizontal scroll.
        return this.element.offsetHeight;
    }
}
//# sourceMappingURL=ConsoleViewport.js.map