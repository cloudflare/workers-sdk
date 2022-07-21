// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
 * Copyright (C) 2007 Apple Inc.  All rights reserved.
 * Copyright (C) 2009 Joseph Pecoraro
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
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as InlineEditor from '../../ui/legacy/components/inline_editor/inline_editor.js';
import * as Components from '../../ui/legacy/components/utils/utils.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as ElementsComponents from './components/components.js';
import computedStyleSidebarPaneStyles from './computedStyleSidebarPane.css.js';
import { ComputedStyleModel } from './ComputedStyleModel.js';
import { ImagePreviewPopover } from './ImagePreviewPopover.js';
import { PlatformFontsWidget } from './PlatformFontsWidget.js';
import { categorizePropertyName, DefaultCategoryOrder } from './PropertyNameCategories.js';
import { StylePropertiesSection } from './StylePropertiesSection.js';
import { StylesSidebarPane, StylesSidebarPropertyRenderer } from './StylesSidebarPane.js';
import * as TreeOutline from '../../ui/components/tree_outline/tree_outline.js';
import * as LitHtml from '../../ui/lit-html/lit-html.js';
const UIStrings = {
    /**
    * @description Placeholder text for a text input used to filter which CSS properties show up in
    * the list of computed properties. In the Computed Style Widget of the Elements panel.
    */
    filter: 'Filter',
    /**
    * @description ARIA accessible name for the text input used to filter which CSS properties show up
    * in the list of computed properties. In the Computed Style Widget of the Elements panel.
    */
    filterComputedStyles: 'Filter Computed Styles',
    /**
    * @description Text for a checkbox setting that controls whether the user-supplied filter text
    * excludes all CSS propreties which are filtered out, or just greys them out. In Computed Style
    * Widget of the Elements panel
    */
    showAll: 'Show all',
    /**
    * @description Text for a checkbox setting that controls whether similar CSS properties should be
    * grouped together or not. In Computed Style Widget of the Elements panel.
    */
    group: 'Group',
    /** [
    * @description Text shown to the user when a filter is applied to the computed CSS properties, but
    * no properties matched the filter and thus no results were returned.
    */
    noMatchingProperty: 'No matching property',
    /**
    * @description Context menu item in Elements panel to navigate to the source code location of the
    * CSS selector that was clicked on.
    */
    navigateToSelectorSource: 'Navigate to selector source',
    /**
    * @description Context menu item in Elements panel to navigate to the corresponding CSS style rule
    * for this computed property.
    */
    navigateToStyle: 'Navigate to style',
};
const str_ = i18n.i18n.registerUIStrings('panels/elements/ComputedStyleWidget.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const createPropertyElement = (node, propertyName, propertyValue, traceable, inherited, onNavigateToSource) => {
    const propertyElement = new ElementsComponents.ComputedStyleProperty.ComputedStyleProperty();
    const renderer = new StylesSidebarPropertyRenderer(null, node, propertyName, propertyValue);
    renderer.setColorHandler(processColor);
    propertyElement.data = {
        propertyNameRenderer: renderer.renderName.bind(renderer),
        propertyValueRenderer: renderer.renderValue.bind(renderer),
        traceable,
        inherited,
        onNavigateToSource,
    };
    return propertyElement;
};
const createTraceElement = (node, property, isPropertyOverloaded, matchedStyles, linkifier) => {
    const trace = new ElementsComponents.ComputedStyleTrace.ComputedStyleTrace();
    const renderer = new StylesSidebarPropertyRenderer(null, node, property.name, property.value);
    renderer.setColorHandler(processColor);
    const valueElement = renderer.renderValue();
    valueElement.slot = 'trace-value';
    trace.appendChild(valueElement);
    const rule = property.ownerStyle.parentRule;
    let ruleOriginNode;
    if (rule) {
        ruleOriginNode = StylePropertiesSection.createRuleOriginNode(matchedStyles, linkifier, rule);
    }
    trace.data = {
        selector: rule ? rule.selectorText() : 'element.style',
        active: !isPropertyOverloaded,
        onNavigateToSource: navigateToSource.bind(null, property),
        ruleOriginNode,
    };
    return trace;
};
const processColor = (text) => {
    const swatch = new InlineEditor.ColorSwatch.ColorSwatch();
    swatch.renderColor(text, true);
    const valueElement = document.createElement('span');
    valueElement.textContent = swatch.getText();
    swatch.append(valueElement);
    swatch.addEventListener(InlineEditor.ColorSwatch.FormatChangedEvent.eventName, (event) => {
        const { data } = event;
        valueElement.textContent = data.text;
    });
    return swatch;
};
const navigateToSource = (cssProperty, event) => {
    if (!event) {
        return;
    }
    void Common.Revealer.reveal(cssProperty);
    event.consume(true);
};
const propertySorter = (propA, propB) => {
    if (propA.startsWith('--') !== propB.startsWith('--')) {
        return propA.startsWith('--') ? 1 : -1;
    }
    if (propA.startsWith('-webkit') !== propB.startsWith('-webkit')) {
        return propA.startsWith('-webkit') ? 1 : -1;
    }
    const canonicalA = SDK.CSSMetadata.cssMetadata().canonicalPropertyName(propA);
    const canonicalB = SDK.CSSMetadata.cssMetadata().canonicalPropertyName(propB);
    return Platform.StringUtilities.compare(canonicalA, canonicalB);
};
export class ComputedStyleWidget extends UI.ThrottledWidget.ThrottledWidget {
    computedStyleModel;
    showInheritedComputedStylePropertiesSetting;
    groupComputedStylesSetting;
    input;
    filterRegex;
    noMatchesElement;
    linkifier;
    imagePreviewPopover;
    #computedStylesTree = new TreeOutline.TreeOutline.TreeOutline();
    #treeData;
    constructor() {
        super(true);
        this.contentElement.classList.add('styles-sidebar-computed-style-widget');
        this.computedStyleModel = new ComputedStyleModel();
        this.computedStyleModel.addEventListener("ComputedStyleChanged" /* ComputedStyleChanged */, this.update, this);
        this.showInheritedComputedStylePropertiesSetting =
            Common.Settings.Settings.instance().createSetting('showInheritedComputedStyleProperties', false);
        this.showInheritedComputedStylePropertiesSetting.addChangeListener(this.update.bind(this));
        this.groupComputedStylesSetting = Common.Settings.Settings.instance().createSetting('groupComputedStyles', false);
        this.groupComputedStylesSetting.addChangeListener(() => {
            this.update();
        });
        const hbox = this.contentElement.createChild('div', 'hbox styles-sidebar-pane-toolbar');
        const filterContainerElement = hbox.createChild('div', 'styles-sidebar-pane-filter-box');
        const filterInput = StylesSidebarPane.createPropertyFilterElement(i18nString(UIStrings.filter), hbox, this.filterComputedStyles.bind(this));
        UI.ARIAUtils.setAccessibleName(filterInput, i18nString(UIStrings.filterComputedStyles));
        filterContainerElement.appendChild(filterInput);
        this.input = filterInput;
        this.filterRegex = null;
        const toolbar = new UI.Toolbar.Toolbar('styles-pane-toolbar', hbox);
        toolbar.appendToolbarItem(new UI.Toolbar.ToolbarSettingCheckbox(this.showInheritedComputedStylePropertiesSetting, undefined, i18nString(UIStrings.showAll)));
        toolbar.appendToolbarItem(new UI.Toolbar.ToolbarSettingCheckbox(this.groupComputedStylesSetting, undefined, i18nString(UIStrings.group)));
        this.noMatchesElement = this.contentElement.createChild('div', 'gray-info-message');
        this.noMatchesElement.textContent = i18nString(UIStrings.noMatchingProperty);
        this.contentElement.appendChild(this.#computedStylesTree);
        this.linkifier = new Components.Linkifier.Linkifier(_maxLinkLength);
        this.imagePreviewPopover = new ImagePreviewPopover(this.contentElement, event => {
            const link = event.composedPath()[0];
            if (link instanceof Element) {
                return link;
            }
            return null;
        }, () => this.computedStyleModel.node());
        const fontsWidget = new PlatformFontsWidget(this.computedStyleModel);
        fontsWidget.show(this.contentElement);
        Common.Settings.Settings.instance().moduleSetting('colorFormat').addChangeListener(this.update.bind(this));
    }
    onResize() {
        const isNarrow = this.contentElement.offsetWidth < 260;
        this.#computedStylesTree.classList.toggle('computed-narrow', isNarrow);
    }
    showInheritedComputedStyleChanged() {
        this.update();
    }
    update() {
        super.update();
    }
    wasShown() {
        super.wasShown();
        this.registerCSSFiles([computedStyleSidebarPaneStyles]);
    }
    async doUpdate() {
        const [nodeStyles, matchedStyles] = await Promise.all([this.computedStyleModel.fetchComputedStyle(), this.fetchMatchedCascade()]);
        if (!nodeStyles || !matchedStyles) {
            this.noMatchesElement.classList.remove('hidden');
            return;
        }
        const shouldGroupComputedStyles = this.groupComputedStylesSetting.get();
        if (shouldGroupComputedStyles) {
            await this.rebuildGroupedList(nodeStyles, matchedStyles);
        }
        else {
            await this.rebuildAlphabeticalList(nodeStyles, matchedStyles);
        }
    }
    async fetchMatchedCascade() {
        const node = this.computedStyleModel.node();
        if (!node || !this.computedStyleModel.cssModel()) {
            return null;
        }
        const cssModel = this.computedStyleModel.cssModel();
        if (!cssModel) {
            return null;
        }
        return cssModel.cachedMatchedCascadeForNode(node).then(validateStyles.bind(this));
        function validateStyles(matchedStyles) {
            return matchedStyles && matchedStyles.node() === this.computedStyleModel.node() ? matchedStyles : null;
        }
    }
    async rebuildAlphabeticalList(nodeStyle, matchedStyles) {
        this.imagePreviewPopover.hide();
        this.linkifier.reset();
        const cssModel = this.computedStyleModel.cssModel();
        if (!cssModel) {
            return;
        }
        const uniqueProperties = [...nodeStyle.computedStyle.keys()];
        uniqueProperties.sort(propertySorter);
        const node = nodeStyle.node;
        const propertyTraces = this.computePropertyTraces(matchedStyles);
        const nonInheritedProperties = this.computeNonInheritedProperties(matchedStyles);
        const showInherited = this.showInheritedComputedStylePropertiesSetting.get();
        const tree = [];
        for (const propertyName of uniqueProperties) {
            const propertyValue = nodeStyle.computedStyle.get(propertyName) || '';
            const canonicalName = SDK.CSSMetadata.cssMetadata().canonicalPropertyName(propertyName);
            const isInherited = !nonInheritedProperties.has(canonicalName);
            if (!showInherited && isInherited && !_alwaysShownComputedProperties.has(propertyName)) {
                continue;
            }
            if (!showInherited && propertyName.startsWith('--')) {
                continue;
            }
            if (propertyName !== canonicalName && propertyValue === nodeStyle.computedStyle.get(canonicalName)) {
                continue;
            }
            tree.push(this.buildTreeNode(propertyTraces, propertyName, propertyValue, isInherited));
        }
        const defaultRenderer = this.createTreeNodeRenderer(propertyTraces, node, matchedStyles);
        this.#treeData = {
            tree,
            compact: true,
            defaultRenderer,
        };
        this.filterAlphabeticalList();
    }
    async rebuildGroupedList(nodeStyle, matchedStyles) {
        this.imagePreviewPopover.hide();
        this.linkifier.reset();
        const cssModel = this.computedStyleModel.cssModel();
        if (!nodeStyle || !matchedStyles || !cssModel) {
            this.noMatchesElement.classList.remove('hidden');
            return;
        }
        const node = nodeStyle.node;
        const propertyTraces = this.computePropertyTraces(matchedStyles);
        const nonInheritedProperties = this.computeNonInheritedProperties(matchedStyles);
        const showInherited = this.showInheritedComputedStylePropertiesSetting.get();
        const propertiesByCategory = new Map();
        const tree = [];
        for (const [propertyName, propertyValue] of nodeStyle.computedStyle) {
            const canonicalName = SDK.CSSMetadata.cssMetadata().canonicalPropertyName(propertyName);
            const isInherited = !nonInheritedProperties.has(canonicalName);
            if (!showInherited && isInherited && !_alwaysShownComputedProperties.has(propertyName)) {
                continue;
            }
            if (!showInherited && propertyName.startsWith('--')) {
                continue;
            }
            if (propertyName !== canonicalName && propertyValue === nodeStyle.computedStyle.get(canonicalName)) {
                continue;
            }
            const categories = categorizePropertyName(propertyName);
            for (const category of categories) {
                if (!propertiesByCategory.has(category)) {
                    propertiesByCategory.set(category, []);
                }
                propertiesByCategory.get(category)?.push(propertyName);
            }
        }
        this.#computedStylesTree.removeChildren();
        for (const category of DefaultCategoryOrder) {
            const properties = propertiesByCategory.get(category);
            if (properties && properties.length > 0) {
                const propertyNodes = [];
                for (const propertyName of properties) {
                    const propertyValue = nodeStyle.computedStyle.get(propertyName) || '';
                    const canonicalName = SDK.CSSMetadata.cssMetadata().canonicalPropertyName(propertyName);
                    const isInherited = !nonInheritedProperties.has(canonicalName);
                    propertyNodes.push(this.buildTreeNode(propertyTraces, propertyName, propertyValue, isInherited));
                }
                tree.push({ id: category, treeNodeData: { tag: 'category', name: category }, children: async () => propertyNodes });
            }
        }
        const defaultRenderer = this.createTreeNodeRenderer(propertyTraces, node, matchedStyles);
        this.#treeData = {
            tree,
            compact: true,
            defaultRenderer,
        };
        return this.filterGroupLists();
    }
    buildTraceNode(property) {
        const rule = property.ownerStyle.parentRule;
        return {
            treeNodeData: {
                tag: 'traceElement',
                property,
                rule,
            },
            id: rule.origin + ': ' + rule.styleSheetId + property.range,
        };
    }
    createTreeNodeRenderer(propertyTraces, domNode, matchedStyles) {
        return node => {
            const data = node.treeNodeData;
            let navigate = () => { };
            if (data.tag === 'property') {
                const trace = propertyTraces.get(data.propertyName);
                const activeProperty = trace?.find(property => matchedStyles.propertyState(property) === SDK.CSSMatchedStyles.PropertyState.Active);
                if (activeProperty) {
                    navigate = navigateToSource.bind(this, activeProperty);
                }
                const propertyElement = createPropertyElement(domNode, data.propertyName, data.propertyValue, propertyTraces.has(data.propertyName), data.inherited, navigate);
                if (activeProperty) {
                    propertyElement.addEventListener('contextmenu', this.handleContextMenuEvent.bind(this, matchedStyles, activeProperty));
                }
                return LitHtml.html `${propertyElement}`;
            }
            if (data.tag === 'traceElement') {
                const isPropertyOverloaded = matchedStyles.propertyState(data.property) === SDK.CSSMatchedStyles.PropertyState.Overloaded;
                const traceElement = createTraceElement(domNode, data.property, isPropertyOverloaded, matchedStyles, this.linkifier);
                traceElement.addEventListener('contextmenu', this.handleContextMenuEvent.bind(this, matchedStyles, data.property));
                return LitHtml.html `${traceElement}`;
            }
            return LitHtml.html `<span style="cursor: text; color: var(--color-text-secondary);">${data.name}</span>`;
        };
    }
    buildTreeNode(propertyTraces, propertyName, propertyValue, isInherited) {
        const treeNodeData = {
            tag: 'property',
            propertyName,
            propertyValue,
            inherited: isInherited,
        };
        const trace = propertyTraces.get(propertyName);
        if (!trace) {
            return {
                treeNodeData,
                id: propertyName,
            };
        }
        return {
            treeNodeData,
            id: propertyName,
            children: async () => trace.map(this.buildTraceNode),
        };
    }
    handleContextMenuEvent(matchedStyles, property, event) {
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        const rule = property.ownerStyle.parentRule;
        if (rule) {
            const header = rule.styleSheetId ? matchedStyles.cssModel().styleSheetHeaderForId(rule.styleSheetId) : null;
            if (header && !header.isAnonymousInlineStyleSheet()) {
                contextMenu.defaultSection().appendItem(i18nString(UIStrings.navigateToSelectorSource), () => {
                    StylePropertiesSection.tryNavigateToRuleLocation(matchedStyles, rule);
                });
            }
        }
        contextMenu.defaultSection().appendItem(i18nString(UIStrings.navigateToStyle), () => Common.Revealer.reveal(property));
        void contextMenu.show();
    }
    computePropertyTraces(matchedStyles) {
        const result = new Map();
        for (const style of matchedStyles.nodeStyles()) {
            const allProperties = style.allProperties();
            for (const property of allProperties) {
                if (!property.activeInStyle() || !matchedStyles.propertyState(property)) {
                    continue;
                }
                if (!result.has(property.name)) {
                    result.set(property.name, []);
                }
                // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
                // @ts-expect-error
                result.get(property.name).push(property);
            }
        }
        return result;
    }
    computeNonInheritedProperties(matchedStyles) {
        const result = new Set();
        for (const style of matchedStyles.nodeStyles()) {
            for (const property of style.allProperties()) {
                if (!matchedStyles.propertyState(property)) {
                    continue;
                }
                result.add(SDK.CSSMetadata.cssMetadata().canonicalPropertyName(property.name));
            }
        }
        return result;
    }
    async filterComputedStyles(regex) {
        this.filterRegex = regex;
        if (this.groupComputedStylesSetting.get()) {
            return this.filterGroupLists();
        }
        return this.filterAlphabeticalList();
    }
    nodeFilter(node) {
        const regex = this.filterRegex;
        const data = node.treeNodeData;
        if (data.tag === 'property') {
            const matched = !regex || regex.test(data.propertyName) || regex.test(data.propertyValue);
            return matched;
        }
        return true;
    }
    filterAlphabeticalList() {
        if (!this.#treeData) {
            return;
        }
        const tree = this.#treeData.tree.filter(this.nodeFilter.bind(this));
        this.#computedStylesTree.data = {
            tree,
            defaultRenderer: this.#treeData.defaultRenderer,
            compact: this.#treeData.compact,
        };
        this.noMatchesElement.classList.toggle('hidden', Boolean(tree.length));
    }
    async filterGroupLists() {
        if (!this.#treeData) {
            return;
        }
        const tree = [];
        for (const group of this.#treeData.tree) {
            const data = group.treeNodeData;
            if (data.tag !== 'category' || !group.children) {
                continue;
            }
            const properties = await group.children();
            const filteredChildren = properties.filter(this.nodeFilter.bind(this));
            if (filteredChildren.length) {
                tree.push({ id: data.name, treeNodeData: { tag: 'category', name: data.name }, children: async () => filteredChildren });
            }
        }
        this.#computedStylesTree.data = {
            tree,
            defaultRenderer: this.#treeData.defaultRenderer,
            compact: this.#treeData.compact,
        };
        await this.#computedStylesTree.expandRecursively(0);
        this.noMatchesElement.classList.toggle('hidden', Boolean(tree.length));
    }
}
// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
// eslint-disable-next-line @typescript-eslint/naming-convention
const _maxLinkLength = 30;
// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
// eslint-disable-next-line @typescript-eslint/naming-convention
const _alwaysShownComputedProperties = new Set(['display', 'height', 'width']);
//# sourceMappingURL=ComputedStyleWidget.js.map