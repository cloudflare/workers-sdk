// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import * as ThemeSupport from './theme_support/theme_support.js';
import * as Utils from './utils/utils.js';
import * as ARIAUtils from './ARIAUtils.js';
import { Size } from './Geometry.js';
import { GlassPane } from './GlassPane.js';
import { Icon } from './Icon.js';
import { ListControl, ListMode } from './ListControl.js';
import { Events as ListModelEvents } from './ListModel.js';
import softDropDownStyles from './softDropDown.css.legacy.js';
import softDropDownButtonStyles from './softDropDownButton.css.legacy.js';
const UIStrings = {
    /**
    *@description Placeholder text in Soft Drop Down
    */
    noItemSelected: '(no item selected)',
};
const str_ = i18n.i18n.registerUIStrings('ui/legacy/SoftDropDown.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class SoftDropDown {
    delegate;
    selectedItem;
    model;
    placeholderText;
    element;
    titleElement;
    glassPane;
    list;
    rowHeight;
    width;
    listWasShowing200msAgo;
    constructor(model, delegate) {
        this.delegate = delegate;
        this.selectedItem = null;
        this.model = model;
        this.placeholderText = i18nString(UIStrings.noItemSelected);
        this.element = document.createElement('button');
        this.element.classList.add('soft-dropdown');
        ThemeSupport.ThemeSupport.instance().appendStyle(this.element, softDropDownButtonStyles);
        this.titleElement = this.element.createChild('span', 'title');
        const dropdownArrowIcon = Icon.create('smallicon-triangle-down');
        this.element.appendChild(dropdownArrowIcon);
        ARIAUtils.setExpanded(this.element, false);
        this.glassPane = new GlassPane();
        this.glassPane.setMarginBehavior("NoMargin" /* NoMargin */);
        this.glassPane.setAnchorBehavior("PreferBottom" /* PreferBottom */);
        this.glassPane.setOutsideClickCallback(this.hide.bind(this));
        this.glassPane.setPointerEventsBehavior("BlockedByGlassPane" /* BlockedByGlassPane */);
        this.list = new ListControl(model, this, ListMode.EqualHeightItems);
        this.list.element.classList.add('item-list');
        this.rowHeight = 36;
        this.width = 315;
        Utils
            .createShadowRootWithCoreStyles(this.glassPane.contentElement, {
            cssFile: softDropDownStyles,
            delegatesFocus: undefined,
        })
            .appendChild(this.list.element);
        ARIAUtils.markAsMenu(this.list.element);
        this.listWasShowing200msAgo = false;
        this.element.addEventListener('mousedown', event => {
            if (this.listWasShowing200msAgo) {
                this.hide(event);
            }
            else if (!this.element.disabled) {
                this.show(event);
            }
        }, false);
        this.element.addEventListener('keydown', this.onKeyDownButton.bind(this), false);
        this.list.element.addEventListener('keydown', this.onKeyDownList.bind(this), false);
        this.list.element.addEventListener('focusout', this.hide.bind(this), false);
        this.list.element.addEventListener('mousedown', event => event.consume(true), false);
        this.list.element.addEventListener('mouseup', event => {
            if (event.target === this.list.element) {
                return;
            }
            if (!this.listWasShowing200msAgo) {
                return;
            }
            this.selectHighlightedItem();
            this.hide(event);
        }, false);
        model.addEventListener(ListModelEvents.ItemsReplaced, this.itemsReplaced, this);
    }
    show(event) {
        if (this.glassPane.isShowing()) {
            return;
        }
        this.glassPane.setContentAnchorBox(this.element.boxInWindow());
        this.glassPane.show(this.element.ownerDocument);
        this.list.element.focus();
        ARIAUtils.setExpanded(this.element, true);
        this.updateGlasspaneSize();
        if (this.selectedItem) {
            this.list.selectItem(this.selectedItem);
        }
        event.consume(true);
        window.setTimeout(() => {
            this.listWasShowing200msAgo = true;
        }, 200);
    }
    updateGlasspaneSize() {
        const maxHeight = this.rowHeight * (Math.min(this.model.length, 9));
        this.glassPane.setMaxContentSize(new Size(this.width, maxHeight));
        this.list.viewportResized();
    }
    hide(event) {
        window.setTimeout(() => {
            this.listWasShowing200msAgo = false;
        }, 200);
        this.glassPane.hide();
        this.list.selectItem(null);
        ARIAUtils.setExpanded(this.element, false);
        this.element.focus();
        event.consume(true);
    }
    onKeyDownButton(ev) {
        const event = ev;
        let handled = false;
        switch (event.key) {
            case 'ArrowUp':
                this.show(event);
                this.list.selectItemNextPage();
                handled = true;
                break;
            case 'ArrowDown':
                this.show(event);
                this.list.selectItemPreviousPage();
                handled = true;
                break;
            case 'Enter':
            case ' ':
                this.show(event);
                handled = true;
                break;
            default:
                break;
        }
        if (handled) {
            event.consume(true);
        }
    }
    onKeyDownList(ev) {
        const event = ev;
        let handled = false;
        switch (event.key) {
            case 'ArrowLeft':
                handled = this.list.selectPreviousItem(false, false);
                break;
            case 'ArrowRight':
                handled = this.list.selectNextItem(false, false);
                break;
            case 'Home':
                for (let i = 0; i < this.model.length; i++) {
                    if (this.isItemSelectable(this.model.at(i))) {
                        this.list.selectItem(this.model.at(i));
                        handled = true;
                        break;
                    }
                }
                break;
            case 'End':
                for (let i = this.model.length - 1; i >= 0; i--) {
                    if (this.isItemSelectable(this.model.at(i))) {
                        this.list.selectItem(this.model.at(i));
                        handled = true;
                        break;
                    }
                }
                break;
            case 'Escape':
                this.hide(event);
                handled = true;
                break;
            case 'Tab':
            case 'Enter':
            case ' ':
                this.selectHighlightedItem();
                this.hide(event);
                handled = true;
                break;
            default:
                if (event.key.length === 1) {
                    const selectedIndex = this.list.selectedIndex();
                    const letter = event.key.toUpperCase();
                    for (let i = 0; i < this.model.length; i++) {
                        const item = this.model.at((selectedIndex + i + 1) % this.model.length);
                        if (this.delegate.titleFor(item).toUpperCase().startsWith(letter)) {
                            this.list.selectItem(item);
                            break;
                        }
                    }
                    handled = true;
                }
                break;
        }
        if (handled) {
            event.consume(true);
        }
    }
    setWidth(width) {
        this.width = width;
        this.updateGlasspaneSize();
    }
    setRowHeight(rowHeight) {
        this.rowHeight = rowHeight;
    }
    setPlaceholderText(text) {
        this.placeholderText = text;
        if (!this.selectedItem) {
            this.titleElement.textContent = this.placeholderText;
        }
    }
    itemsReplaced(event) {
        const { removed } = event.data;
        if (this.selectedItem && removed.indexOf(this.selectedItem) !== -1) {
            this.selectedItem = null;
            this.selectHighlightedItem();
        }
        this.updateGlasspaneSize();
    }
    selectItem(item) {
        this.selectedItem = item;
        if (this.selectedItem) {
            this.titleElement.textContent = this.delegate.titleFor(this.selectedItem);
        }
        else {
            this.titleElement.textContent = this.placeholderText;
        }
        this.delegate.itemSelected(this.selectedItem);
    }
    createElementForItem(item) {
        const element = document.createElement('div');
        element.classList.add('item');
        element.addEventListener('mousemove', e => {
            if ((e.movementX || e.movementY) && this.delegate.isItemSelectable(item)) {
                this.list.selectItem(item, false, /* Don't scroll */ true);
            }
        });
        element.classList.toggle('disabled', !this.delegate.isItemSelectable(item));
        element.classList.toggle('highlighted', this.list.selectedItem() === item);
        ARIAUtils.markAsMenuItem(element);
        element.appendChild(this.delegate.createElementForItem(item));
        return element;
    }
    heightForItem(_item) {
        return this.rowHeight;
    }
    isItemSelectable(item) {
        return this.delegate.isItemSelectable(item);
    }
    selectedItemChanged(from, to, fromElement, toElement) {
        if (fromElement) {
            fromElement.classList.remove('highlighted');
        }
        if (toElement) {
            toElement.classList.add('highlighted');
        }
        ARIAUtils.setActiveDescendant(this.list.element, toElement);
        this.delegate.highlightedItemChanged(from, to, fromElement && fromElement.firstElementChild, toElement && toElement.firstElementChild);
    }
    updateSelectedItemARIA(_fromElement, _toElement) {
        return false;
    }
    selectHighlightedItem() {
        this.selectItem(this.list.selectedItem());
    }
    refreshItem(item) {
        this.list.refreshItem(item);
    }
}
//# sourceMappingURL=SoftDropDown.js.map