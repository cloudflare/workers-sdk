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
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as Utils from './utils/utils.js';
import * as ARIAUtils from './ARIAUtils.js';
import { Size } from './Geometry.js';
import { GlassPane } from './GlassPane.js';
import { Icon } from './Icon.js';
import { ListControl, ListMode } from './ListControl.js';
import { ListModel } from './ListModel.js';
import { measurePreferredSize } from './UIUtils.js';
import suggestBoxStyles from './suggestBox.css.legacy.js';
const UIStrings = {
    /**
    *@description Aria alert to read the suggestion for the suggestion box when typing in text editor
    *@example {name} PH1
    *@example {2} PH2
    *@example {5} PH3
    */
    sSuggestionSOfS: '{PH1}, suggestion {PH2} of {PH3}',
    /**
    *@description Aria alert to confirm the suggestion when it is selected from the suggestion box
    *@example {name} PH1
    */
    sSuggestionSSelected: '{PH1}, suggestion selected',
};
const str_ = i18n.i18n.registerUIStrings('ui/legacy/SuggestBox.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class SuggestBox {
    suggestBoxDelegate;
    maxItemsHeight;
    rowHeight;
    userEnteredText;
    defaultSelectionIsDimmed;
    onlyCompletion;
    items;
    list;
    element;
    glassPane;
    constructor(suggestBoxDelegate, maxItemsHeight) {
        this.suggestBoxDelegate = suggestBoxDelegate;
        this.maxItemsHeight = maxItemsHeight;
        this.rowHeight = 17;
        this.userEnteredText = '';
        this.defaultSelectionIsDimmed = false;
        this.onlyCompletion = null;
        this.items = new ListModel();
        this.list = new ListControl(this.items, this, ListMode.EqualHeightItems);
        this.element = this.list.element;
        this.element.classList.add('suggest-box');
        this.element.addEventListener('mousedown', event => event.preventDefault(), true);
        this.element.addEventListener('click', this.onClick.bind(this), false);
        this.glassPane = new GlassPane();
        this.glassPane.setAnchorBehavior("PreferBottom" /* PreferBottom */);
        this.glassPane.setOutsideClickCallback(this.hide.bind(this));
        const shadowRoot = Utils.createShadowRootWithCoreStyles(this.glassPane.contentElement, { cssFile: suggestBoxStyles, delegatesFocus: undefined });
        shadowRoot.appendChild(this.element);
    }
    visible() {
        return this.glassPane.isShowing();
    }
    setPosition(anchorBox) {
        this.glassPane.setContentAnchorBox(anchorBox);
    }
    setAnchorBehavior(behavior) {
        this.glassPane.setAnchorBehavior(behavior);
    }
    updateMaxSize(items) {
        const maxWidth = this.maxWidth(items);
        const length = this.maxItemsHeight ? Math.min(this.maxItemsHeight, items.length) : items.length;
        const maxHeight = length * this.rowHeight;
        this.glassPane.setMaxContentSize(new Size(maxWidth, maxHeight));
    }
    maxWidth(items) {
        const kMaxWidth = 300;
        if (!items.length) {
            return kMaxWidth;
        }
        let maxItem;
        let maxLength = -Infinity;
        for (let i = 0; i < items.length; i++) {
            const length = (items[i].title || items[i].text).length + (items[i].subtitle || '').length;
            if (length > maxLength) {
                maxLength = length;
                maxItem = items[i];
            }
        }
        const element = this.createElementForItem(maxItem);
        const preferredWidth = measurePreferredSize(element, this.element).width + Utils.measuredScrollbarWidth(this.element.ownerDocument);
        return Math.min(kMaxWidth, preferredWidth);
    }
    show() {
        if (this.visible()) {
            return;
        }
        // TODO(dgozman): take document as a parameter.
        this.glassPane.show(document);
        const suggestion = { text: '1', subtitle: '12' };
        this.rowHeight = measurePreferredSize(this.createElementForItem(suggestion), this.element).height;
        ARIAUtils.setControls(this.suggestBoxDelegate.ariaControlledBy(), this.element);
        ARIAUtils.setExpanded(this.suggestBoxDelegate.ariaControlledBy(), true);
    }
    hide() {
        if (!this.visible()) {
            return;
        }
        this.glassPane.hide();
        ARIAUtils.setControls(this.suggestBoxDelegate.ariaControlledBy(), null);
        ARIAUtils.setExpanded(this.suggestBoxDelegate.ariaControlledBy(), false);
    }
    applySuggestion(isIntermediateSuggestion) {
        if (this.onlyCompletion) {
            isIntermediateSuggestion ?
                ARIAUtils.alert(i18nString(UIStrings.sSuggestionSOfS, { PH1: this.onlyCompletion.text, PH2: this.list.selectedIndex() + 1, PH3: this.items.length })) :
                ARIAUtils.alert(i18nString(UIStrings.sSuggestionSSelected, { PH1: this.onlyCompletion.text }));
            this.suggestBoxDelegate.applySuggestion(this.onlyCompletion, isIntermediateSuggestion);
            return true;
        }
        const suggestion = this.list.selectedItem();
        if (suggestion && suggestion.text) {
            isIntermediateSuggestion ?
                ARIAUtils.alert(i18nString(UIStrings.sSuggestionSOfS, {
                    PH1: suggestion.title || suggestion.text,
                    PH2: this.list.selectedIndex() + 1,
                    PH3: this.items.length,
                })) :
                ARIAUtils.alert(i18nString(UIStrings.sSuggestionSSelected, { PH1: suggestion.title || suggestion.text }));
        }
        this.suggestBoxDelegate.applySuggestion(suggestion, isIntermediateSuggestion);
        return this.visible() && Boolean(suggestion);
    }
    acceptSuggestion() {
        const result = this.applySuggestion();
        this.hide();
        if (!result) {
            return false;
        }
        this.suggestBoxDelegate.acceptSuggestion();
        return true;
    }
    createElementForItem(item) {
        const query = this.userEnteredText;
        const element = document.createElement('div');
        element.classList.add('suggest-box-content-item');
        element.classList.add('source-code');
        if (item.iconType) {
            const icon = Icon.create(item.iconType, 'suggestion-icon');
            element.appendChild(icon);
        }
        if (item.isSecondary) {
            element.classList.add('secondary');
        }
        element.tabIndex = -1;
        const maxTextLength = 50 + query.length;
        const displayText = Platform.StringUtilities.trimEndWithMaxLength((item.title || item.text).trim(), maxTextLength)
            .replace(/\n/g, '\u21B5');
        const titleElement = element.createChild('span', 'suggestion-title');
        const index = displayText.toLowerCase().indexOf(query.toLowerCase());
        if (index > 0) {
            titleElement.createChild('span').textContent = displayText.substring(0, index);
        }
        if (index > -1) {
            titleElement.createChild('span', 'query').textContent = displayText.substring(index, index + query.length);
        }
        titleElement.createChild('span').textContent = displayText.substring(index > -1 ? index + query.length : 0);
        titleElement.createChild('span', 'spacer');
        if (item.subtitleRenderer) {
            const subtitleElement = item.subtitleRenderer.call(null);
            subtitleElement.classList.add('suggestion-subtitle');
            element.appendChild(subtitleElement);
        }
        else if (item.subtitle) {
            const subtitleElement = element.createChild('span', 'suggestion-subtitle');
            subtitleElement.textContent =
                Platform.StringUtilities.trimEndWithMaxLength(item.subtitle, maxTextLength - displayText.length);
        }
        if (item.iconElement) {
            element.appendChild(item.iconElement);
        }
        return element;
    }
    heightForItem(_item) {
        return this.rowHeight;
    }
    isItemSelectable(_item) {
        return true;
    }
    selectedItemChanged(from, to, fromElement, toElement) {
        if (fromElement) {
            fromElement.classList.remove('selected', 'force-white-icons');
        }
        if (toElement) {
            toElement.classList.add('selected');
            toElement.classList.add('force-white-icons');
        }
        this.applySuggestion(true);
    }
    updateSelectedItemARIA(_fromElement, _toElement) {
        return false;
    }
    onClick(event) {
        const item = this.list.itemForNode(event.target);
        if (!item) {
            return;
        }
        this.list.selectItem(item);
        this.acceptSuggestion();
        event.consume(true);
    }
    canShowBox(completions, highestPriorityItem, canShowForSingleItem, userEnteredText) {
        if (!completions || !completions.length) {
            return false;
        }
        if (completions.length > 1) {
            return true;
        }
        if (!highestPriorityItem || highestPriorityItem.isSecondary ||
            !highestPriorityItem.text.startsWith(userEnteredText)) {
            return true;
        }
        // Do not show a single suggestion if it is the same as user-entered query, even if allowed to show single-item suggest boxes.
        return canShowForSingleItem && highestPriorityItem.text !== userEnteredText;
    }
    updateSuggestions(anchorBox, completions, selectHighestPriority, canShowForSingleItem, userEnteredText) {
        this.onlyCompletion = null;
        const highestPriorityItem = selectHighestPriority ? completions.reduce((a, b) => (a.priority || 0) >= (b.priority || 0) ? a : b) : null;
        if (this.canShowBox(completions, highestPriorityItem, canShowForSingleItem, userEnteredText)) {
            this.userEnteredText = userEnteredText;
            this.show();
            this.updateMaxSize(completions);
            this.glassPane.setContentAnchorBox(anchorBox);
            this.list.invalidateItemHeight();
            this.items.replaceAll(completions);
            if (highestPriorityItem && !highestPriorityItem.isSecondary) {
                this.list.selectItem(highestPriorityItem, true);
            }
            else {
                this.list.selectItem(null);
            }
        }
        else {
            if (completions.length === 1) {
                this.onlyCompletion = completions[0];
                this.applySuggestion(true);
            }
            this.hide();
        }
    }
    keyPressed(event) {
        switch (event.key) {
            case 'Enter':
                return this.enterKeyPressed();
            case 'ArrowUp':
                return this.list.selectPreviousItem(true, false);
            case 'ArrowDown':
                return this.list.selectNextItem(true, false);
            case 'PageUp':
                return this.list.selectItemPreviousPage(false);
            case 'PageDown':
                return this.list.selectItemNextPage(false);
        }
        return false;
    }
    enterKeyPressed() {
        const hasSelectedItem = Boolean(this.list.selectedItem()) || Boolean(this.onlyCompletion);
        this.acceptSuggestion();
        // Report the event as non-handled if there is no selected item,
        // to commit the input or handle it otherwise.
        return hasSelectedItem;
    }
}
//# sourceMappingURL=SuggestBox.js.map