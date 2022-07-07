// Copyright 2022 The Chromium Authors. All rights reserved.
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
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Bindings from '../../models/bindings/bindings.js';
import * as TextUtils from '../../models/text_utils/text_utils.js';
import * as UI from '../../ui/legacy/legacy.js';
import { FontEditorSectionManager } from './ColorSwatchPopoverIcon.js';
import * as ElementsComponents from './components/components.js';
import { linkifyDeferredNodeReference } from './DOMLinkifier.js';
import { ElementsPanel } from './ElementsPanel.js';
import stylesSectionTreeStyles from './stylesSectionTree.css.js';
import { StylePropertyTreeElement } from './StylePropertyTreeElement.js';
import { StylesSidebarPane } from './StylesSidebarPane.js';
const UIStrings = {
    /**
    *@description Tooltip text that appears when hovering over the largeicon add button in the Styles Sidebar Pane of the Elements panel
    */
    insertStyleRuleBelow: 'Insert Style Rule Below',
    /**
    *@description Text in Styles Sidebar Pane of the Elements panel
    */
    constructedStylesheet: 'constructed stylesheet',
    /**
    *@description Text in Styles Sidebar Pane of the Elements panel
    */
    userAgentStylesheet: 'user agent stylesheet',
    /**
    *@description Text in Styles Sidebar Pane of the Elements panel
    */
    injectedStylesheet: 'injected stylesheet',
    /**
    *@description Text in Styles Sidebar Pane of the Elements panel
    */
    viaInspector: 'via inspector',
    /**
    *@description Text in Styles Sidebar Pane of the Elements panel
    */
    styleAttribute: '`style` attribute',
    /**
    *@description Text in Styles Sidebar Pane of the Elements panel
    *@example {html} PH1
    */
    sattributesStyle: '{PH1}[Attributes Style]',
    /**
    *@description Show all button text content in Styles Sidebar Pane of the Elements panel
    *@example {3} PH1
    */
    showAllPropertiesSMore: 'Show All Properties ({PH1} more)',
    /**
    *@description Text in Elements Tree Element of the Elements panel, copy should be used as a verb
    */
    copySelector: 'Copy `selector`',
    /**
    *@description A context menu item in Styles panel to copy CSS rule
    */
    copyRule: 'Copy rule',
    /**
    *@description A context menu item in Styles panel to copy all CSS declarations
    */
    copyAllDeclarations: 'Copy all declarations',
    /**
    *@description  A context menu item in Styles panel to copy all the CSS changes
    */
    copyAllCSSChanges: 'Copy all CSS changes',
    /**
    *@description Text that is announced by the screen reader when the user focuses on an input field for editing the name of a CSS selector in the Styles panel
    */
    cssSelector: '`CSS` selector',
};
const str_ = i18n.i18n.registerUIStrings('panels/elements/StylePropertiesSection.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
// TODO(crbug.com/1172300) This workaround is needed to keep the linter happy.
// Otherwise it complains about: Unknown word CssSyntaxError
const STYLE_TAG = '<' +
    'style>';
export class StylePropertiesSection {
    parentPane;
    styleInternal;
    matchedStyles;
    computedStyles;
    parentsComputedStyles;
    editable;
    hoverTimer;
    willCauseCancelEditing;
    forceShowAll;
    originalPropertiesCount;
    element;
    innerElement;
    titleElement;
    propertiesTreeOutline;
    showAllButton;
    selectorElement;
    newStyleRuleToolbar;
    fontEditorToolbar;
    fontEditorSectionManager;
    fontEditorButton;
    selectedSinceMouseDown;
    elementToSelectorIndex;
    navigable;
    selectorRefElement;
    selectorContainer;
    hoverableSelectorsMode;
    isHiddenInternal;
    queryListElement;
    // Used to identify buttons that trigger a flexbox or grid editor.
    nextEditorTriggerButtonIdx = 1;
    sectionIdx = 0;
    constructor(parentPane, matchedStyles, style, sectionIdx, computedStyles, parentsComputedStyles) {
        this.parentPane = parentPane;
        this.sectionIdx = sectionIdx;
        this.styleInternal = style;
        this.matchedStyles = matchedStyles;
        this.computedStyles = computedStyles;
        this.parentsComputedStyles = parentsComputedStyles;
        this.editable = Boolean(style.styleSheetId && style.range);
        this.hoverTimer = null;
        this.willCauseCancelEditing = false;
        this.forceShowAll = false;
        this.originalPropertiesCount = style.leadingProperties().length;
        const rule = style.parentRule;
        this.element = document.createElement('div');
        this.element.classList.add('styles-section');
        this.element.classList.add('matched-styles');
        this.element.classList.add('monospace');
        UI.ARIAUtils.setAccessibleName(this.element, `${this.headerText()}, css selector`);
        this.element.tabIndex = -1;
        UI.ARIAUtils.markAsListitem(this.element);
        this.element.addEventListener('keydown', this.onKeyDown.bind(this), false);
        parentPane.sectionByElement.set(this.element, this);
        this.innerElement = this.element.createChild('div');
        this.titleElement = this.innerElement.createChild('div', 'styles-section-title ' + (rule ? 'styles-selector' : ''));
        this.propertiesTreeOutline = new UI.TreeOutline.TreeOutlineInShadow();
        this.propertiesTreeOutline.setFocusable(false);
        this.propertiesTreeOutline.registerCSSFiles([stylesSectionTreeStyles]);
        this.propertiesTreeOutline.element.classList.add('style-properties', 'matched-styles', 'monospace');
        // @ts-ignore TODO: fix ad hoc section property in a separate CL to be safe
        this.propertiesTreeOutline.section = this;
        this.innerElement.appendChild(this.propertiesTreeOutline.element);
        this.showAllButton = UI.UIUtils.createTextButton('', this.showAllItems.bind(this), 'styles-show-all');
        this.innerElement.appendChild(this.showAllButton);
        const selectorContainer = document.createElement('div');
        this.selectorElement = document.createElement('span');
        UI.ARIAUtils.setAccessibleName(this.selectorElement, i18nString(UIStrings.cssSelector));
        this.selectorElement.classList.add('selector');
        this.selectorElement.textContent = this.headerText();
        selectorContainer.appendChild(this.selectorElement);
        this.selectorElement.addEventListener('mouseenter', this.onMouseEnterSelector.bind(this), false);
        this.selectorElement.addEventListener('mousemove', event => event.consume(), false);
        this.selectorElement.addEventListener('mouseleave', this.onMouseOutSelector.bind(this), false);
        const openBrace = selectorContainer.createChild('span', 'sidebar-pane-open-brace');
        openBrace.textContent = ' {';
        selectorContainer.addEventListener('mousedown', this.handleEmptySpaceMouseDown.bind(this), false);
        selectorContainer.addEventListener('click', this.handleSelectorContainerClick.bind(this), false);
        const closeBrace = this.innerElement.createChild('div', 'sidebar-pane-closing-brace');
        closeBrace.textContent = '}';
        if (this.styleInternal.parentRule) {
            const newRuleButton = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.insertStyleRuleBelow), 'largeicon-add');
            newRuleButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.onNewRuleClick, this);
            newRuleButton.element.tabIndex = -1;
            if (!this.newStyleRuleToolbar) {
                this.newStyleRuleToolbar =
                    new UI.Toolbar.Toolbar('sidebar-pane-section-toolbar new-rule-toolbar', this.innerElement);
            }
            this.newStyleRuleToolbar.appendToolbarItem(newRuleButton);
            UI.ARIAUtils.markAsHidden(this.newStyleRuleToolbar.element);
        }
        if (Root.Runtime.experiments.isEnabled('fontEditor') && this.editable) {
            this.fontEditorToolbar = new UI.Toolbar.Toolbar('sidebar-pane-section-toolbar', this.innerElement);
            this.fontEditorSectionManager = new FontEditorSectionManager(this.parentPane.swatchPopoverHelper(), this);
            this.fontEditorButton = new UI.Toolbar.ToolbarButton('Font Editor', 'largeicon-font-editor');
            this.fontEditorButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, () => {
                this.onFontEditorButtonClicked();
            }, this);
            this.fontEditorButton.element.addEventListener('keydown', event => {
                if (isEnterOrSpaceKey(event)) {
                    event.consume(true);
                    this.onFontEditorButtonClicked();
                }
            }, false);
            this.fontEditorToolbar.appendToolbarItem(this.fontEditorButton);
            if (this.styleInternal.type === SDK.CSSStyleDeclaration.Type.Inline) {
                if (this.newStyleRuleToolbar) {
                    this.newStyleRuleToolbar.element.classList.add('shifted-toolbar');
                }
            }
            else {
                this.fontEditorToolbar.element.classList.add('font-toolbar-hidden');
            }
        }
        this.selectorElement.addEventListener('click', this.handleSelectorClick.bind(this), false);
        this.element.addEventListener('contextmenu', this.handleContextMenuEvent.bind(this), false);
        this.element.addEventListener('mousedown', this.handleEmptySpaceMouseDown.bind(this), false);
        this.element.addEventListener('click', this.handleEmptySpaceClick.bind(this), false);
        this.element.addEventListener('mousemove', this.onMouseMove.bind(this), false);
        this.element.addEventListener('mouseleave', this.onMouseLeave.bind(this), false);
        this.selectedSinceMouseDown = false;
        this.elementToSelectorIndex = new WeakMap();
        if (rule) {
            // Prevent editing the user agent and user rules.
            if (rule.isUserAgent() || rule.isInjected()) {
                this.editable = false;
            }
            else {
                // Check this is a real CSSRule, not a bogus object coming from BlankStylePropertiesSection.
                if (rule.styleSheetId) {
                    const header = rule.cssModel().styleSheetHeaderForId(rule.styleSheetId);
                    this.navigable = header && !header.isAnonymousInlineStyleSheet();
                }
            }
        }
        this.queryListElement = this.titleElement.createChild('div', 'query-list query-matches');
        this.selectorRefElement = this.titleElement.createChild('div', 'styles-section-subtitle');
        this.updateQueryList();
        this.updateRuleOrigin();
        this.titleElement.appendChild(selectorContainer);
        this.selectorContainer = selectorContainer;
        if (this.navigable) {
            this.element.classList.add('navigable');
        }
        if (!this.editable) {
            this.element.classList.add('read-only');
            this.propertiesTreeOutline.element.classList.add('read-only');
        }
        this.hoverableSelectorsMode = false;
        this.isHiddenInternal = false;
        this.markSelectorMatches();
        this.onpopulate();
    }
    setSectionIdx(sectionIdx) {
        this.sectionIdx = sectionIdx;
        this.onpopulate();
    }
    getSectionIdx() {
        return this.sectionIdx;
    }
    registerFontProperty(treeElement) {
        if (this.fontEditorSectionManager) {
            this.fontEditorSectionManager.registerFontProperty(treeElement);
        }
        if (this.fontEditorToolbar) {
            this.fontEditorToolbar.element.classList.remove('font-toolbar-hidden');
            if (this.newStyleRuleToolbar) {
                this.newStyleRuleToolbar.element.classList.add('shifted-toolbar');
            }
        }
    }
    resetToolbars() {
        if (this.parentPane.swatchPopoverHelper().isShowing() ||
            this.styleInternal.type === SDK.CSSStyleDeclaration.Type.Inline) {
            return;
        }
        if (this.fontEditorToolbar) {
            this.fontEditorToolbar.element.classList.add('font-toolbar-hidden');
        }
        if (this.newStyleRuleToolbar) {
            this.newStyleRuleToolbar.element.classList.remove('shifted-toolbar');
        }
    }
    static createRuleOriginNode(matchedStyles, linkifier, rule) {
        if (!rule) {
            return document.createTextNode('');
        }
        const ruleLocation = this.getRuleLocationFromCSSRule(rule);
        const header = rule.styleSheetId ? matchedStyles.cssModel().styleSheetHeaderForId(rule.styleSheetId) : null;
        function linkifyRuleLocation() {
            if (!rule) {
                return null;
            }
            if (ruleLocation && rule.styleSheetId && header && !header.isAnonymousInlineStyleSheet()) {
                return StylePropertiesSection.linkifyRuleLocation(matchedStyles.cssModel(), linkifier, rule.styleSheetId, ruleLocation);
            }
            return null;
        }
        function linkifyNode(label) {
            if (header?.ownerNode) {
                const link = linkifyDeferredNodeReference(header.ownerNode, {
                    preventKeyboardFocus: false,
                    tooltip: undefined,
                });
                link.textContent = label;
                return link;
            }
            return null;
        }
        if (header?.isMutable && !header.isViaInspector()) {
            const location = header.isConstructedByNew() ? null : linkifyRuleLocation();
            if (location) {
                return location;
            }
            const label = header.isConstructedByNew() ? i18nString(UIStrings.constructedStylesheet) : STYLE_TAG;
            const node = linkifyNode(label);
            if (node) {
                return node;
            }
            return document.createTextNode(label);
        }
        const location = linkifyRuleLocation();
        if (location) {
            return location;
        }
        if (rule.isUserAgent()) {
            return document.createTextNode(i18nString(UIStrings.userAgentStylesheet));
        }
        if (rule.isInjected()) {
            return document.createTextNode(i18nString(UIStrings.injectedStylesheet));
        }
        if (rule.isViaInspector()) {
            return document.createTextNode(i18nString(UIStrings.viaInspector));
        }
        const node = linkifyNode(STYLE_TAG);
        if (node) {
            return node;
        }
        return document.createTextNode('');
    }
    static getRuleLocationFromCSSRule(rule) {
        let ruleLocation;
        if (rule instanceof SDK.CSSRule.CSSStyleRule) {
            ruleLocation = rule.style.range;
        }
        else if (rule instanceof SDK.CSSRule.CSSKeyframeRule) {
            ruleLocation = rule.key().range;
        }
        return ruleLocation;
    }
    static tryNavigateToRuleLocation(matchedStyles, rule) {
        if (!rule) {
            return;
        }
        const ruleLocation = this.getRuleLocationFromCSSRule(rule);
        const header = rule.styleSheetId ? matchedStyles.cssModel().styleSheetHeaderForId(rule.styleSheetId) : null;
        if (ruleLocation && rule.styleSheetId && header && !header.isAnonymousInlineStyleSheet()) {
            const matchingSelectorLocation = this.getCSSSelectorLocation(matchedStyles.cssModel(), rule.styleSheetId, ruleLocation);
            this.revealSelectorSource(matchingSelectorLocation, true);
        }
    }
    static linkifyRuleLocation(cssModel, linkifier, styleSheetId, ruleLocation) {
        const matchingSelectorLocation = this.getCSSSelectorLocation(cssModel, styleSheetId, ruleLocation);
        return linkifier.linkifyCSSLocation(matchingSelectorLocation);
    }
    static getCSSSelectorLocation(cssModel, styleSheetId, ruleLocation) {
        const styleSheetHeader = cssModel.styleSheetHeaderForId(styleSheetId);
        const lineNumber = styleSheetHeader.lineNumberInSource(ruleLocation.startLine);
        const columnNumber = styleSheetHeader.columnNumberInSource(ruleLocation.startLine, ruleLocation.startColumn);
        return new SDK.CSSModel.CSSLocation(styleSheetHeader, lineNumber, columnNumber);
    }
    getFocused() {
        return this.propertiesTreeOutline.shadowRoot.activeElement || null;
    }
    focusNext(element) {
        // Clear remembered focused item (if any).
        const focused = this.getFocused();
        if (focused) {
            focused.tabIndex = -1;
        }
        // Focus the next item and remember it (if in our subtree).
        element.focus();
        if (this.propertiesTreeOutline.shadowRoot.contains(element)) {
            element.tabIndex = 0;
        }
    }
    ruleNavigation(keyboardEvent) {
        if (keyboardEvent.altKey || keyboardEvent.ctrlKey || keyboardEvent.metaKey || keyboardEvent.shiftKey) {
            return;
        }
        const focused = this.getFocused();
        let focusNext = null;
        const focusable = Array.from(this.propertiesTreeOutline.shadowRoot.querySelectorAll('[tabindex]'));
        if (focusable.length === 0) {
            return;
        }
        const focusedIndex = focused ? focusable.indexOf(focused) : -1;
        if (keyboardEvent.key === 'ArrowLeft') {
            focusNext = focusable[focusedIndex - 1] || this.element;
        }
        else if (keyboardEvent.key === 'ArrowRight') {
            focusNext = focusable[focusedIndex + 1] || this.element;
        }
        else if (keyboardEvent.key === 'ArrowUp' || keyboardEvent.key === 'ArrowDown') {
            this.focusNext(this.element);
            return;
        }
        if (focusNext) {
            this.focusNext(focusNext);
            keyboardEvent.consume(true);
        }
    }
    onKeyDown(event) {
        const keyboardEvent = event;
        if (UI.UIUtils.isEditing() || !this.editable || keyboardEvent.altKey || keyboardEvent.ctrlKey ||
            keyboardEvent.metaKey) {
            return;
        }
        switch (keyboardEvent.key) {
            case 'Enter':
            case ' ':
                this.startEditingAtFirstPosition();
                keyboardEvent.consume(true);
                break;
            case 'ArrowLeft':
            case 'ArrowRight':
            case 'ArrowUp':
            case 'ArrowDown':
                this.ruleNavigation(keyboardEvent);
                break;
            default:
                // Filter out non-printable key strokes.
                if (keyboardEvent.key.length === 1) {
                    this.addNewBlankProperty(0).startEditing();
                }
                break;
        }
    }
    setSectionHovered(isHovered) {
        this.element.classList.toggle('styles-panel-hovered', isHovered);
        this.propertiesTreeOutline.element.classList.toggle('styles-panel-hovered', isHovered);
        if (this.hoverableSelectorsMode !== isHovered) {
            this.hoverableSelectorsMode = isHovered;
            this.markSelectorMatches();
        }
    }
    onMouseLeave(_event) {
        this.setSectionHovered(false);
        this.parentPane.setActiveProperty(null);
    }
    onMouseMove(event) {
        const hasCtrlOrMeta = UI.KeyboardShortcut.KeyboardShortcut.eventHasCtrlEquivalentKey(event);
        this.setSectionHovered(hasCtrlOrMeta);
        const treeElement = this.propertiesTreeOutline.treeElementFromEvent(event);
        if (treeElement instanceof StylePropertyTreeElement) {
            this.parentPane.setActiveProperty(treeElement);
        }
        else {
            this.parentPane.setActiveProperty(null);
        }
        const selection = this.element.getComponentSelection();
        if (!this.selectedSinceMouseDown && selection && selection.toString()) {
            this.selectedSinceMouseDown = true;
        }
    }
    onFontEditorButtonClicked() {
        if (this.fontEditorSectionManager && this.fontEditorButton) {
            void this.fontEditorSectionManager.showPopover(this.fontEditorButton.element, this.parentPane);
        }
    }
    style() {
        return this.styleInternal;
    }
    headerText() {
        const node = this.matchedStyles.nodeForStyle(this.styleInternal);
        if (this.styleInternal.type === SDK.CSSStyleDeclaration.Type.Inline) {
            return this.matchedStyles.isInherited(this.styleInternal) ? i18nString(UIStrings.styleAttribute) :
                'element.style';
        }
        if (node && this.styleInternal.type === SDK.CSSStyleDeclaration.Type.Attributes) {
            return i18nString(UIStrings.sattributesStyle, { PH1: node.nodeNameInCorrectCase() });
        }
        if (this.styleInternal.parentRule instanceof SDK.CSSRule.CSSStyleRule) {
            return this.styleInternal.parentRule.selectorText();
        }
        return '';
    }
    onMouseOutSelector() {
        if (this.hoverTimer) {
            clearTimeout(this.hoverTimer);
        }
        SDK.OverlayModel.OverlayModel.hideDOMNodeHighlight();
    }
    onMouseEnterSelector() {
        if (this.hoverTimer) {
            clearTimeout(this.hoverTimer);
        }
        this.hoverTimer = window.setTimeout(this.highlight.bind(this), 300);
    }
    highlight(mode = 'all') {
        SDK.OverlayModel.OverlayModel.hideDOMNodeHighlight();
        const node = this.parentPane.node();
        if (!node) {
            return;
        }
        const selectorList = this.styleInternal.parentRule && this.styleInternal.parentRule instanceof SDK.CSSRule.CSSStyleRule ?
            this.styleInternal.parentRule.selectorText() :
            undefined;
        node.domModel().overlayModel().highlightInOverlay({ node, selectorList }, mode);
    }
    firstSibling() {
        const parent = this.element.parentElement;
        if (!parent) {
            return null;
        }
        let childElement = parent.firstChild;
        while (childElement) {
            const childSection = this.parentPane.sectionByElement.get(childElement);
            if (childSection) {
                return childSection;
            }
            childElement = childElement.nextSibling;
        }
        return null;
    }
    findCurrentOrNextVisible(willIterateForward, originalSection) {
        if (!this.isHidden()) {
            return this;
        }
        if (this === originalSection) {
            return null;
        }
        if (!originalSection) {
            originalSection = this;
        }
        let visibleSibling = null;
        const nextSibling = willIterateForward ? this.nextSibling() : this.previousSibling();
        if (nextSibling) {
            visibleSibling = nextSibling.findCurrentOrNextVisible(willIterateForward, originalSection);
        }
        else {
            const loopSibling = willIterateForward ? this.firstSibling() : this.lastSibling();
            if (loopSibling) {
                visibleSibling = loopSibling.findCurrentOrNextVisible(willIterateForward, originalSection);
            }
        }
        return visibleSibling;
    }
    lastSibling() {
        const parent = this.element.parentElement;
        if (!parent) {
            return null;
        }
        let childElement = parent.lastChild;
        while (childElement) {
            const childSection = this.parentPane.sectionByElement.get(childElement);
            if (childSection) {
                return childSection;
            }
            childElement = childElement.previousSibling;
        }
        return null;
    }
    nextSibling() {
        let curElement = this.element;
        do {
            curElement = curElement.nextSibling;
        } while (curElement && !this.parentPane.sectionByElement.has(curElement));
        if (curElement) {
            return this.parentPane.sectionByElement.get(curElement);
        }
        return;
    }
    previousSibling() {
        let curElement = this.element;
        do {
            curElement = curElement.previousSibling;
        } while (curElement && !this.parentPane.sectionByElement.has(curElement));
        if (curElement) {
            return this.parentPane.sectionByElement.get(curElement);
        }
        return;
    }
    onNewRuleClick(event) {
        event.data.consume();
        const rule = this.styleInternal.parentRule;
        if (!rule || !rule.style.range || rule.styleSheetId === undefined) {
            return;
        }
        const range = TextUtils.TextRange.TextRange.createFromLocation(rule.style.range.endLine, rule.style.range.endColumn + 1);
        this.parentPane.addBlankSection(this, rule.styleSheetId, range);
    }
    styleSheetEdited(edit) {
        const rule = this.styleInternal.parentRule;
        if (rule) {
            rule.rebase(edit);
        }
        else {
            this.styleInternal.rebase(edit);
        }
        this.updateQueryList();
        this.updateRuleOrigin();
    }
    createAtRuleLists(rule) {
        this.createMediaList(rule.media);
        this.createContainerQueryList(rule.containerQueries);
        this.createScopesList(rule.scopes);
        this.createSupportsList(rule.supports);
    }
    createMediaList(mediaRules) {
        for (let i = mediaRules.length - 1; i >= 0; --i) {
            const media = mediaRules[i];
            // Don't display trivial non-print media types.
            const isMedia = !media.text || !media.text.includes('(') && media.text !== 'print';
            if (isMedia) {
                continue;
            }
            let queryPrefix = '';
            let queryText = '';
            let onQueryTextClick;
            switch (media.source) {
                case SDK.CSSMedia.Source.LINKED_SHEET:
                case SDK.CSSMedia.Source.INLINE_SHEET: {
                    queryText = `media="${media.text}"`;
                    break;
                }
                case SDK.CSSMedia.Source.MEDIA_RULE: {
                    queryPrefix = '@media';
                    queryText = media.text;
                    if (media.styleSheetId) {
                        onQueryTextClick = this.handleQueryRuleClick.bind(this, media);
                    }
                    break;
                }
                case SDK.CSSMedia.Source.IMPORT_RULE: {
                    queryText = `@import ${media.text}`;
                    break;
                }
            }
            const mediaQueryElement = new ElementsComponents.CSSQuery.CSSQuery();
            mediaQueryElement.data = {
                queryPrefix,
                queryText,
                onQueryTextClick,
            };
            this.queryListElement.append(mediaQueryElement);
        }
    }
    createContainerQueryList(containerQueries) {
        for (let i = containerQueries.length - 1; i >= 0; --i) {
            const containerQuery = containerQueries[i];
            if (!containerQuery.text) {
                continue;
            }
            let onQueryTextClick;
            if (containerQuery.styleSheetId) {
                onQueryTextClick = this.handleQueryRuleClick.bind(this, containerQuery);
            }
            const containerQueryElement = new ElementsComponents.CSSQuery.CSSQuery();
            containerQueryElement.data = {
                queryPrefix: '@container',
                queryName: containerQuery.name,
                queryText: containerQuery.text,
                onQueryTextClick,
            };
            this.queryListElement.append(containerQueryElement);
            void this.addContainerForContainerQuery(containerQuery);
        }
    }
    createScopesList(scopesList) {
        for (let i = scopesList.length - 1; i >= 0; --i) {
            const scope = scopesList[i];
            if (!scope.text) {
                continue;
            }
            let onQueryTextClick;
            if (scope.styleSheetId) {
                onQueryTextClick = this.handleQueryRuleClick.bind(this, scope);
            }
            const scopeElement = new ElementsComponents.CSSQuery.CSSQuery();
            scopeElement.data = {
                queryPrefix: '@scope',
                queryText: scope.text,
                onQueryTextClick,
            };
            this.queryListElement.append(scopeElement);
        }
    }
    createSupportsList(supportsList) {
        for (let i = supportsList.length - 1; i >= 0; --i) {
            const supports = supportsList[i];
            if (!supports.text) {
                continue;
            }
            let onQueryTextClick;
            if (supports.styleSheetId) {
                onQueryTextClick = this.handleQueryRuleClick.bind(this, supports);
            }
            const supportsElement = new ElementsComponents.CSSQuery.CSSQuery();
            supportsElement.data = {
                queryPrefix: '@supports',
                queryText: supports.text,
                onQueryTextClick,
            };
            this.queryListElement.append(supportsElement);
        }
    }
    async addContainerForContainerQuery(containerQuery) {
        const container = await containerQuery.getContainerForNode(this.matchedStyles.node().id);
        if (!container) {
            return;
        }
        const containerElement = new ElementsComponents.QueryContainer.QueryContainer();
        containerElement.data = {
            container: ElementsComponents.Helper.legacyNodeToElementsComponentsNode(container.containerNode),
            queryName: containerQuery.name,
            onContainerLinkClick: (event) => {
                event.preventDefault();
                void ElementsPanel.instance().revealAndSelectNode(container.containerNode, true, true);
                void container.containerNode.scrollIntoView();
            },
        };
        containerElement.addEventListener('queriedsizerequested', async () => {
            const details = await container.getContainerSizeDetails();
            if (details) {
                containerElement.updateContainerQueriedSizeDetails(details);
            }
        });
        this.queryListElement.prepend(containerElement);
    }
    updateQueryList() {
        this.queryListElement.removeChildren();
        if (this.styleInternal.parentRule && this.styleInternal.parentRule instanceof SDK.CSSRule.CSSStyleRule) {
            this.createAtRuleLists(this.styleInternal.parentRule);
        }
    }
    isPropertyInherited(propertyName) {
        if (this.matchedStyles.isInherited(this.styleInternal)) {
            // While rendering inherited stylesheet, reverse meaning of this property.
            // Render truly inherited properties with black, i.e. return them as non-inherited.
            return !SDK.CSSMetadata.cssMetadata().isPropertyInherited(propertyName);
        }
        return false;
    }
    nextEditableSibling() {
        let curSection = this;
        do {
            curSection = curSection.nextSibling();
        } while (curSection && !curSection.editable);
        if (!curSection) {
            curSection = this.firstSibling();
            while (curSection && !curSection.editable) {
                curSection = curSection.nextSibling();
            }
        }
        return (curSection && curSection.editable) ? curSection : null;
    }
    previousEditableSibling() {
        let curSection = this;
        do {
            curSection = curSection.previousSibling();
        } while (curSection && !curSection.editable);
        if (!curSection) {
            curSection = this.lastSibling();
            while (curSection && !curSection.editable) {
                curSection = curSection.previousSibling();
            }
        }
        return (curSection && curSection.editable) ? curSection : null;
    }
    refreshUpdate(editedTreeElement) {
        this.parentPane.refreshUpdate(this, editedTreeElement);
    }
    updateVarFunctions(editedTreeElement) {
        let child = this.propertiesTreeOutline.firstChild();
        while (child) {
            if (child !== editedTreeElement && child instanceof StylePropertyTreeElement) {
                child.updateTitleIfComputedValueChanged();
            }
            child = child.traverseNextTreeElement(false /* skipUnrevealed */, null /* stayWithin */, true /* dontPopulate */);
        }
    }
    update(full) {
        this.selectorElement.textContent = this.headerText();
        this.markSelectorMatches();
        if (full) {
            this.onpopulate();
        }
        else {
            let child = this.propertiesTreeOutline.firstChild();
            while (child && child instanceof StylePropertyTreeElement) {
                child.setOverloaded(this.isPropertyOverloaded(child.property));
                child =
                    child.traverseNextTreeElement(false /* skipUnrevealed */, null /* stayWithin */, true /* dontPopulate */);
            }
        }
    }
    showAllItems(event) {
        if (event) {
            event.consume();
        }
        if (this.forceShowAll) {
            return;
        }
        this.forceShowAll = true;
        this.onpopulate();
    }
    onpopulate() {
        this.parentPane.setActiveProperty(null);
        this.nextEditorTriggerButtonIdx = 1;
        this.propertiesTreeOutline.removeChildren();
        const style = this.styleInternal;
        let count = 0;
        const properties = style.leadingProperties();
        const maxProperties = StylePropertiesSection.MaxProperties + properties.length - this.originalPropertiesCount;
        for (const property of properties) {
            if (!this.forceShowAll && count >= maxProperties) {
                break;
            }
            count++;
            const isShorthand = Boolean(style.longhandProperties(property.name).length);
            const inherited = this.isPropertyInherited(property.name);
            const overloaded = this.isPropertyOverloaded(property);
            if (style.parentRule && style.parentRule.isUserAgent() && inherited) {
                continue;
            }
            const item = new StylePropertyTreeElement(this.parentPane, this.matchedStyles, property, isShorthand, inherited, overloaded, false);
            item.setComputedStyles(this.computedStyles);
            item.setParentsComputedStyles(this.parentsComputedStyles);
            this.propertiesTreeOutline.appendChild(item);
        }
        if (count < properties.length) {
            this.showAllButton.classList.remove('hidden');
            this.showAllButton.textContent = i18nString(UIStrings.showAllPropertiesSMore, { PH1: properties.length - count });
        }
        else {
            this.showAllButton.classList.add('hidden');
        }
    }
    isPropertyOverloaded(property) {
        return this.matchedStyles.propertyState(property) === SDK.CSSMatchedStyles.PropertyState.Overloaded;
    }
    updateFilter() {
        let hasMatchingChild = false;
        this.showAllItems();
        for (const child of this.propertiesTreeOutline.rootElement().children()) {
            if (child instanceof StylePropertyTreeElement) {
                const childHasMatches = child.updateFilter();
                hasMatchingChild = hasMatchingChild || childHasMatches;
            }
        }
        const regex = this.parentPane.filterRegex();
        const hideRule = !hasMatchingChild && regex !== null && !regex.test(this.element.deepTextContent());
        this.isHiddenInternal = hideRule;
        this.element.classList.toggle('hidden', hideRule);
        if (!hideRule && this.styleInternal.parentRule) {
            this.markSelectorHighlights();
        }
        return !hideRule;
    }
    isHidden() {
        return this.isHiddenInternal;
    }
    markSelectorMatches() {
        const rule = this.styleInternal.parentRule;
        if (!rule || !(rule instanceof SDK.CSSRule.CSSStyleRule)) {
            return;
        }
        this.queryListElement.classList.toggle('query-matches', this.matchedStyles.queryMatches(this.styleInternal));
        const selectorTexts = rule.selectors.map(selector => selector.text);
        const matchingSelectorIndexes = this.matchedStyles.getMatchingSelectors(rule);
        const matchingSelectors = new Array(selectorTexts.length).fill(false);
        for (const matchingIndex of matchingSelectorIndexes) {
            matchingSelectors[matchingIndex] = true;
        }
        if (this.parentPane.isEditingStyle) {
            return;
        }
        const fragment = this.hoverableSelectorsMode ? this.renderHoverableSelectors(selectorTexts, matchingSelectors) :
            this.renderSimplifiedSelectors(selectorTexts, matchingSelectors);
        this.selectorElement.removeChildren();
        this.selectorElement.appendChild(fragment);
        this.markSelectorHighlights();
    }
    renderHoverableSelectors(selectors, matchingSelectors) {
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < selectors.length; ++i) {
            if (i) {
                UI.UIUtils.createTextChild(fragment, ', ');
            }
            fragment.appendChild(this.createSelectorElement(selectors[i], matchingSelectors[i], i));
        }
        return fragment;
    }
    createSelectorElement(text, isMatching, navigationIndex) {
        const element = document.createElement('span');
        element.classList.add('simple-selector');
        element.classList.toggle('selector-matches', isMatching);
        if (typeof navigationIndex === 'number') {
            this.elementToSelectorIndex.set(element, navigationIndex);
        }
        element.textContent = text;
        return element;
    }
    renderSimplifiedSelectors(selectors, matchingSelectors) {
        const fragment = document.createDocumentFragment();
        let currentMatching = false;
        let text = '';
        for (let i = 0; i < selectors.length; ++i) {
            if (currentMatching !== matchingSelectors[i] && text) {
                fragment.appendChild(this.createSelectorElement(text, currentMatching));
                text = '';
            }
            currentMatching = matchingSelectors[i];
            text += selectors[i] + (i === selectors.length - 1 ? '' : ', ');
        }
        if (text) {
            fragment.appendChild(this.createSelectorElement(text, currentMatching));
        }
        return fragment;
    }
    markSelectorHighlights() {
        const selectors = this.selectorElement.getElementsByClassName('simple-selector');
        const regex = this.parentPane.filterRegex();
        for (let i = 0; i < selectors.length; ++i) {
            const selectorMatchesFilter = regex !== null && regex.test(selectors[i].textContent || '');
            selectors[i].classList.toggle('filter-match', selectorMatchesFilter);
        }
    }
    checkWillCancelEditing() {
        const willCauseCancelEditing = this.willCauseCancelEditing;
        this.willCauseCancelEditing = false;
        return willCauseCancelEditing;
    }
    handleSelectorContainerClick(event) {
        if (this.checkWillCancelEditing() || !this.editable) {
            return;
        }
        if (event.target === this.selectorContainer) {
            this.addNewBlankProperty(0).startEditing();
            event.consume(true);
        }
    }
    addNewBlankProperty(index = this.propertiesTreeOutline.rootElement().childCount()) {
        const property = this.styleInternal.newBlankProperty(index);
        const item = new StylePropertyTreeElement(this.parentPane, this.matchedStyles, property, false, false, false, true);
        this.propertiesTreeOutline.insertChild(item, property.index);
        return item;
    }
    handleEmptySpaceMouseDown() {
        this.willCauseCancelEditing = this.parentPane.isEditingStyle;
        this.selectedSinceMouseDown = false;
    }
    handleEmptySpaceClick(event) {
        if (!this.editable || this.element.hasSelection() || this.checkWillCancelEditing() || this.selectedSinceMouseDown) {
            return;
        }
        const target = event.target;
        if (target.classList.contains('header') || this.element.classList.contains('read-only') ||
            target.enclosingNodeOrSelfWithClass('query')) {
            event.consume();
            return;
        }
        const deepTarget = UI.UIUtils.deepElementFromEvent(event);
        const treeElement = deepTarget && UI.TreeOutline.TreeElement.getTreeElementBylistItemNode(deepTarget);
        if (treeElement && treeElement instanceof StylePropertyTreeElement) {
            this.addNewBlankProperty(treeElement.property.index + 1).startEditing();
        }
        else {
            this.addNewBlankProperty().startEditing();
        }
        event.consume(true);
    }
    handleQueryRuleClick(query, event) {
        const element = event.currentTarget;
        if (UI.UIUtils.isBeingEdited(element)) {
            return;
        }
        if (UI.KeyboardShortcut.KeyboardShortcut.eventHasCtrlEquivalentKey(event) && this.navigable) {
            const location = query.rawLocation();
            if (!location) {
                event.consume(true);
                return;
            }
            const uiLocation = Bindings.CSSWorkspaceBinding.CSSWorkspaceBinding.instance().rawLocationToUILocation(location);
            if (uiLocation) {
                void Common.Revealer.reveal(uiLocation);
            }
            event.consume(true);
            return;
        }
        if (!this.editable) {
            return;
        }
        const config = new UI.InplaceEditor.Config(this.editingMediaCommitted.bind(this, query), this.editingMediaCancelled.bind(this, element), undefined, this.editingMediaBlurHandler.bind(this));
        UI.InplaceEditor.InplaceEditor.startEditing(element, config);
        const selection = element.getComponentSelection();
        if (selection) {
            selection.selectAllChildren(element);
        }
        this.parentPane.setEditingStyle(true);
        const parentMediaElement = element.enclosingNodeOrSelfWithClass('query');
        parentMediaElement.classList.add('editing-query');
        event.consume(true);
    }
    editingMediaFinished(element) {
        this.parentPane.setEditingStyle(false);
        const parentMediaElement = element.enclosingNodeOrSelfWithClass('query');
        parentMediaElement.classList.remove('editing-query');
    }
    editingMediaCancelled(element) {
        this.editingMediaFinished(element);
        // Mark the selectors in group if necessary.
        // This is overridden by BlankStylePropertiesSection.
        this.markSelectorMatches();
        const selection = element.getComponentSelection();
        if (selection) {
            selection.collapse(element, 0);
        }
    }
    editingMediaBlurHandler() {
        return true;
    }
    async editingMediaCommitted(query, element, newContent, _oldContent, _context, _moveDirection) {
        this.parentPane.setEditingStyle(false);
        this.editingMediaFinished(element);
        if (newContent) {
            newContent = newContent.trim();
        }
        // This gets deleted in finishOperation(), which is called both on success and failure.
        this.parentPane.setUserOperation(true);
        const cssModel = this.parentPane.cssModel();
        if (cssModel && query.styleSheetId) {
            const range = query.range;
            let success = false;
            if (query instanceof SDK.CSSContainerQuery.CSSContainerQuery) {
                success = await cssModel.setContainerQueryText(query.styleSheetId, range, newContent);
            }
            else if (query instanceof SDK.CSSSupports.CSSSupports) {
                success = await cssModel.setSupportsText(query.styleSheetId, range, newContent);
            }
            else if (query instanceof SDK.CSSScope.CSSScope) {
                success = await cssModel.setScopeText(query.styleSheetId, range, newContent);
            }
            else {
                success = await cssModel.setMediaText(query.styleSheetId, range, newContent);
            }
            if (success) {
                this.matchedStyles.resetActiveProperties();
                this.parentPane.refreshUpdate(this);
            }
            this.parentPane.setUserOperation(false);
            this.editingMediaTextCommittedForTest();
        }
    }
    editingMediaTextCommittedForTest() {
    }
    handleSelectorClick(event) {
        const target = event.target;
        if (!target) {
            return;
        }
        if (UI.KeyboardShortcut.KeyboardShortcut.eventHasCtrlEquivalentKey(event) && this.navigable &&
            target.classList.contains('simple-selector')) {
            const selectorIndex = this.elementToSelectorIndex.get(target);
            if (selectorIndex) {
                this.navigateToSelectorSource(selectorIndex, true);
            }
            event.consume(true);
            return;
        }
        if (this.element.hasSelection()) {
            return;
        }
        this.startEditingAtFirstPosition();
        event.consume(true);
    }
    handleContextMenuEvent(event) {
        const target = event.target;
        if (!target) {
            return;
        }
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        contextMenu.clipboardSection().appendItem(i18nString(UIStrings.copySelector), () => {
            const selectorText = this.headerText();
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(selectorText);
            Host.userMetrics.styleTextCopied(Host.UserMetrics.StyleTextCopied.SelectorViaContextMenu);
        });
        contextMenu.clipboardSection().appendItem(i18nString(UIStrings.copyRule), () => {
            const ruleText = StylesSidebarPane.formatLeadingProperties(this).ruleText;
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(ruleText);
            Host.userMetrics.styleTextCopied(Host.UserMetrics.StyleTextCopied.RuleViaContextMenu);
        });
        contextMenu.clipboardSection().appendItem(i18nString(UIStrings.copyAllDeclarations), () => {
            const allDeclarationText = StylesSidebarPane.formatLeadingProperties(this).allDeclarationText;
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(allDeclarationText);
            Host.userMetrics.styleTextCopied(Host.UserMetrics.StyleTextCopied.AllDeclarationsViaContextMenu);
        });
        // TODO(changhaohan): conditionally add this item only when there are changes to copy
        contextMenu.clipboardSection().appendItem(i18nString(UIStrings.copyAllCSSChanges), async () => {
            const allChanges = await this.parentPane.getFormattedChanges();
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(allChanges);
            Host.userMetrics.styleTextCopied(Host.UserMetrics.StyleTextCopied.AllChangesViaStylesPane);
        });
        void contextMenu.show();
    }
    navigateToSelectorSource(index, focus) {
        const cssModel = this.parentPane.cssModel();
        if (!cssModel) {
            return;
        }
        const rule = this.styleInternal.parentRule;
        if (!rule || rule.styleSheetId === undefined) {
            return;
        }
        const header = cssModel.styleSheetHeaderForId(rule.styleSheetId);
        if (!header) {
            return;
        }
        const rawLocation = new SDK.CSSModel.CSSLocation(header, rule.lineNumberInSource(index), rule.columnNumberInSource(index));
        StylePropertiesSection.revealSelectorSource(rawLocation, focus);
    }
    static revealSelectorSource(rawLocation, focus) {
        const uiLocation = Bindings.CSSWorkspaceBinding.CSSWorkspaceBinding.instance().rawLocationToUILocation(rawLocation);
        if (uiLocation) {
            void Common.Revealer.reveal(uiLocation, !focus);
        }
    }
    startEditingAtFirstPosition() {
        if (!this.editable) {
            return;
        }
        if (!this.styleInternal.parentRule) {
            this.moveEditorFromSelector('forward');
            return;
        }
        this.startEditingSelector();
    }
    startEditingSelector() {
        const element = this.selectorElement;
        if (UI.UIUtils.isBeingEdited(element)) {
            return;
        }
        element.scrollIntoViewIfNeeded(false);
        // Reset selector marks in group, and normalize whitespace.
        const textContent = element.textContent;
        if (textContent !== null) {
            element.textContent = textContent.replace(/\s+/g, ' ').trim();
        }
        const config = new UI.InplaceEditor.Config(this.editingSelectorCommitted.bind(this), this.editingSelectorCancelled.bind(this));
        UI.InplaceEditor.InplaceEditor.startEditing(this.selectorElement, config);
        const selection = element.getComponentSelection();
        if (selection) {
            selection.selectAllChildren(element);
        }
        this.parentPane.setEditingStyle(true);
        if (element.classList.contains('simple-selector')) {
            this.navigateToSelectorSource(0, false);
        }
    }
    moveEditorFromSelector(moveDirection) {
        this.markSelectorMatches();
        if (!moveDirection) {
            return;
        }
        if (moveDirection === 'forward') {
            const firstChild = this.propertiesTreeOutline.firstChild();
            let currentChild = firstChild;
            while (currentChild && currentChild.inherited()) {
                const sibling = currentChild.nextSibling;
                currentChild = sibling instanceof StylePropertyTreeElement ? sibling : null;
            }
            if (!currentChild) {
                this.addNewBlankProperty().startEditing();
            }
            else {
                currentChild.startEditing(currentChild.nameElement);
            }
        }
        else {
            const previousSection = this.previousEditableSibling();
            if (!previousSection) {
                return;
            }
            previousSection.addNewBlankProperty().startEditing();
        }
    }
    editingSelectorCommitted(element, newContent, oldContent, context, moveDirection) {
        this.editingSelectorEnded();
        if (newContent) {
            newContent = newContent.trim();
        }
        if (newContent === oldContent) {
            // Revert to a trimmed version of the selector if need be.
            this.selectorElement.textContent = newContent;
            this.moveEditorFromSelector(moveDirection);
            return;
        }
        const rule = this.styleInternal.parentRule;
        if (!rule) {
            return;
        }
        function headerTextCommitted() {
            this.parentPane.setUserOperation(false);
            this.moveEditorFromSelector(moveDirection);
            this.editingSelectorCommittedForTest();
        }
        // This gets deleted in finishOperationAndMoveEditor(), which is called both on success and failure.
        this.parentPane.setUserOperation(true);
        void this.setHeaderText(rule, newContent).then(headerTextCommitted.bind(this));
    }
    setHeaderText(rule, newContent) {
        function onSelectorsUpdated(rule, success) {
            if (!success) {
                return Promise.resolve();
            }
            return this.matchedStyles.recomputeMatchingSelectors(rule).then(updateSourceRanges.bind(this, rule));
        }
        function updateSourceRanges(rule) {
            const doesAffectSelectedNode = this.matchedStyles.getMatchingSelectors(rule).length > 0;
            this.propertiesTreeOutline.element.classList.toggle('no-affect', !doesAffectSelectedNode);
            this.matchedStyles.resetActiveProperties();
            this.parentPane.refreshUpdate(this);
        }
        if (!(rule instanceof SDK.CSSRule.CSSStyleRule)) {
            return Promise.resolve();
        }
        const oldSelectorRange = rule.selectorRange();
        if (!oldSelectorRange) {
            return Promise.resolve();
        }
        return rule.setSelectorText(newContent).then(onSelectorsUpdated.bind(this, rule, Boolean(oldSelectorRange)));
    }
    editingSelectorCommittedForTest() {
    }
    updateRuleOrigin() {
        this.selectorRefElement.removeChildren();
        this.selectorRefElement.appendChild(StylePropertiesSection.createRuleOriginNode(this.matchedStyles, this.parentPane.linkifier, this.styleInternal.parentRule));
    }
    editingSelectorEnded() {
        this.parentPane.setEditingStyle(false);
    }
    editingSelectorCancelled() {
        this.editingSelectorEnded();
        // Mark the selectors in group if necessary.
        // This is overridden by BlankStylePropertiesSection.
        this.markSelectorMatches();
    }
    /**
     * A property at or near an index and suitable for subsequent editing.
     * Either the last property, if index out-of-upper-bound,
     * or property at index, if such a property exists,
     * or otherwise, null.
     */
    closestPropertyForEditing(propertyIndex) {
        const rootElement = this.propertiesTreeOutline.rootElement();
        if (propertyIndex >= rootElement.childCount()) {
            return rootElement.lastChild();
        }
        return rootElement.childAt(propertyIndex);
    }
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/naming-convention
    static MaxProperties = 50;
}
export class BlankStylePropertiesSection extends StylePropertiesSection {
    normal;
    ruleLocation;
    styleSheetId;
    constructor(stylesPane, matchedStyles, defaultSelectorText, styleSheetId, ruleLocation, insertAfterStyle, sectionIdx) {
        const cssModel = stylesPane.cssModel();
        const rule = SDK.CSSRule.CSSStyleRule.createDummyRule(cssModel, defaultSelectorText);
        super(stylesPane, matchedStyles, rule.style, sectionIdx, null, null);
        this.normal = false;
        this.ruleLocation = ruleLocation;
        this.styleSheetId = styleSheetId;
        this.selectorRefElement.removeChildren();
        this.selectorRefElement.appendChild(StylePropertiesSection.linkifyRuleLocation(cssModel, this.parentPane.linkifier, styleSheetId, this.actualRuleLocation()));
        if (insertAfterStyle && insertAfterStyle.parentRule &&
            insertAfterStyle.parentRule instanceof SDK.CSSRule.CSSStyleRule) {
            this.createAtRuleLists(insertAfterStyle.parentRule);
        }
        this.element.classList.add('blank-section');
    }
    actualRuleLocation() {
        const prefix = this.rulePrefix();
        const lines = prefix.split('\n');
        const lastLine = lines[lines.length - 1];
        const editRange = new TextUtils.TextRange.TextRange(0, 0, lines.length - 1, lastLine ? lastLine.length : 0);
        return this.ruleLocation.rebaseAfterTextEdit(TextUtils.TextRange.TextRange.createFromLocation(0, 0), editRange);
    }
    rulePrefix() {
        return this.ruleLocation.startLine === 0 && this.ruleLocation.startColumn === 0 ? '' : '\n\n';
    }
    get isBlank() {
        return !this.normal;
    }
    editingSelectorCommitted(element, newContent, oldContent, context, moveDirection) {
        if (!this.isBlank) {
            super.editingSelectorCommitted(element, newContent, oldContent, context, moveDirection);
            return;
        }
        function onRuleAdded(newRule) {
            if (!newRule) {
                this.editingSelectorCancelled();
                this.editingSelectorCommittedForTest();
                return Promise.resolve();
            }
            return this.matchedStyles.addNewRule(newRule, this.matchedStyles.node())
                .then(onAddedToCascade.bind(this, newRule));
        }
        function onAddedToCascade(newRule) {
            const doesSelectorAffectSelectedNode = this.matchedStyles.getMatchingSelectors(newRule).length > 0;
            this.makeNormal(newRule);
            if (!doesSelectorAffectSelectedNode) {
                this.propertiesTreeOutline.element.classList.add('no-affect');
            }
            this.updateRuleOrigin();
            this.parentPane.setUserOperation(false);
            this.editingSelectorEnded();
            if (this.element.parentElement) // Might have been detached already.
             {
                this.moveEditorFromSelector(moveDirection);
            }
            this.markSelectorMatches();
            this.editingSelectorCommittedForTest();
        }
        if (newContent) {
            newContent = newContent.trim();
        }
        this.parentPane.setUserOperation(true);
        const cssModel = this.parentPane.cssModel();
        const ruleText = this.rulePrefix() + newContent + ' {}';
        if (cssModel) {
            void cssModel.addRule(this.styleSheetId, ruleText, this.ruleLocation).then(onRuleAdded.bind(this));
        }
    }
    editingSelectorCancelled() {
        this.parentPane.setUserOperation(false);
        if (!this.isBlank) {
            super.editingSelectorCancelled();
            return;
        }
        this.editingSelectorEnded();
        this.parentPane.removeSection(this);
    }
    makeNormal(newRule) {
        this.element.classList.remove('blank-section');
        this.styleInternal = newRule.style;
        // FIXME: replace this instance by a normal StylePropertiesSection.
        this.normal = true;
    }
}
export class KeyframePropertiesSection extends StylePropertiesSection {
    constructor(stylesPane, matchedStyles, style, sectionIdx) {
        super(stylesPane, matchedStyles, style, sectionIdx, null, null);
        this.selectorElement.className = 'keyframe-key';
    }
    headerText() {
        if (this.styleInternal.parentRule instanceof SDK.CSSRule.CSSKeyframeRule) {
            return this.styleInternal.parentRule.key().text;
        }
        return '';
    }
    setHeaderText(rule, newContent) {
        function updateSourceRanges(success) {
            if (!success) {
                return;
            }
            this.parentPane.refreshUpdate(this);
        }
        if (!(rule instanceof SDK.CSSRule.CSSKeyframeRule)) {
            return Promise.resolve();
        }
        const oldRange = rule.key().range;
        if (!oldRange) {
            return Promise.resolve();
        }
        return rule.setKeyText(newContent).then(updateSourceRanges.bind(this));
    }
    isPropertyInherited(_propertyName) {
        return false;
    }
    isPropertyOverloaded(_property) {
        return false;
    }
    markSelectorHighlights() {
    }
    markSelectorMatches() {
        if (this.styleInternal.parentRule instanceof SDK.CSSRule.CSSKeyframeRule) {
            this.selectorElement.textContent = this.styleInternal.parentRule.key().text;
        }
    }
    highlight() {
    }
}
export class HighlightPseudoStylePropertiesSection extends StylePropertiesSection {
    isPropertyInherited(_propertyName) {
        // For highlight pseudos, all valid properties are treated as inherited.
        // Note that the meaning is reversed in this context; the result of
        // returning false here is that properties of inherited pseudos will never
        // be shown in the darker style of non-inherited properties.
        return false;
    }
}
//# sourceMappingURL=StylePropertiesSection.js.map