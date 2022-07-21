// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { StylePropertyTreeElement } from './StylePropertyTreeElement.js';
export class StylePropertyHighlighter {
    styleSidebarPane;
    constructor(ssp) {
        this.styleSidebarPane = ssp;
    }
    /**
     * Expand all shorthands, find the given property, scroll to it and highlight it.
     */
    highlightProperty(cssProperty) {
        // Expand all shorthands.
        for (const section of this.styleSidebarPane.allSections()) {
            for (let treeElement = section.propertiesTreeOutline.firstChild(); treeElement; treeElement = treeElement.nextSibling) {
                void treeElement.onpopulate();
            }
        }
        const { treeElement, section } = this.findTreeElementAndSection(treeElement => treeElement.property === cssProperty);
        if (treeElement) {
            treeElement.parent && treeElement.parent.expand();
            this.scrollAndHighlightTreeElement(treeElement);
            if (section) {
                section.element.focus();
            }
        }
    }
    /**
     * Find the first non-overridden property that matches the provided name, scroll to it and highlight it.
     */
    findAndHighlightPropertyName(propertyName) {
        for (const section of this.styleSidebarPane.allSections()) {
            if (!section.style().hasActiveProperty(propertyName)) {
                continue;
            }
            section.showAllItems();
            const treeElement = this.findTreeElementFromSection(treeElement => treeElement.property.name === propertyName && !treeElement.overloaded(), section);
            if (treeElement) {
                this.scrollAndHighlightTreeElement(treeElement);
                if (section) {
                    section.element.focus();
                }
                return;
            }
        }
    }
    /**
     * Traverse the styles pane tree, execute the provided callback for every tree element found, and
     * return the first tree element and corresponding section for which the callback returns a truthy value.
     */
    findTreeElementAndSection(compareCb) {
        for (const section of this.styleSidebarPane.allSections()) {
            const treeElement = this.findTreeElementFromSection(compareCb, section);
            if (treeElement) {
                return { treeElement, section };
            }
        }
        return { treeElement: null, section: null };
    }
    findTreeElementFromSection(compareCb, section) {
        let treeElement = section.propertiesTreeOutline.firstChild();
        while (treeElement && (treeElement instanceof StylePropertyTreeElement)) {
            if (compareCb(treeElement)) {
                return treeElement;
            }
            treeElement = treeElement.traverseNextTreeElement(false, null, true);
        }
        return null;
    }
    scrollAndHighlightTreeElement(treeElement) {
        treeElement.listItemElement.scrollIntoViewIfNeeded();
        treeElement.listItemElement.animate([
            { offset: 0, backgroundColor: 'rgba(255, 255, 0, 0.2)' },
            { offset: 0.1, backgroundColor: 'rgba(255, 255, 0, 0.7)' },
            { offset: 1, backgroundColor: 'transparent' },
        ], { duration: 2000, easing: 'cubic-bezier(0, 0, 0.2, 1)' });
    }
}
//# sourceMappingURL=StylePropertyHighlighter.js.map