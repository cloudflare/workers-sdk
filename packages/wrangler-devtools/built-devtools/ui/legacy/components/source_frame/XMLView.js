// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../../core/i18n/i18n.js';
import * as Platform from '../../../../core/platform/platform.js';
import * as TextUtils from '../../../../models/text_utils/text_utils.js';
import * as UI from '../../legacy.js';
import xmlTreeStyles from './xmlTree.css.legacy.js';
import xmlViewStyles from './xmlView.css.legacy.js';
const UIStrings = {
    /**
    *@description Text to find an item
    */
    find: 'Find',
};
const str_ = i18n.i18n.registerUIStrings('ui/legacy/components/source_frame/XMLView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class XMLView extends UI.Widget.Widget {
    treeOutline;
    searchableView;
    currentSearchFocusIndex;
    currentSearchTreeElements;
    searchConfig;
    constructor(parsedXML) {
        super(true);
        this.registerRequiredCSS(xmlViewStyles);
        this.contentElement.classList.add('shadow-xml-view', 'source-code');
        this.treeOutline = new UI.TreeOutline.TreeOutlineInShadow();
        this.treeOutline.registerRequiredCSS(xmlTreeStyles);
        this.contentElement.appendChild(this.treeOutline.element);
        this.currentSearchFocusIndex = 0;
        this.currentSearchTreeElements = [];
        XMLViewNode.populate(this.treeOutline, parsedXML, this);
        const firstChild = this.treeOutline.firstChild();
        if (firstChild) {
            firstChild.select(true /* omitFocus */, false /* selectedByUser */);
        }
    }
    static createSearchableView(parsedXML) {
        const xmlView = new XMLView(parsedXML);
        const searchableView = new UI.SearchableView.SearchableView(xmlView, null);
        searchableView.setPlaceholder(i18nString(UIStrings.find));
        xmlView.searchableView = searchableView;
        xmlView.show(searchableView.element);
        return searchableView;
    }
    static parseXML(text, mimeType) {
        let parsedXML;
        try {
            switch (mimeType) {
                case 'application/xhtml+xml':
                case 'application/xml':
                case 'image/svg+xml':
                case 'text/html':
                case 'text/xml':
                    parsedXML = (new DOMParser()).parseFromString(text, mimeType);
            }
        }
        catch (e) {
            return null;
        }
        if (!parsedXML || parsedXML.body) {
            return null;
        }
        return parsedXML;
    }
    jumpToMatch(index, shouldJump) {
        if (!this.searchConfig) {
            return;
        }
        const { regex } = this.searchConfig.toSearchRegex(true);
        const previousFocusElement = this.currentSearchTreeElements[this.currentSearchFocusIndex];
        if (previousFocusElement) {
            previousFocusElement.setSearchRegex(regex);
        }
        const newFocusElement = this.currentSearchTreeElements[index];
        if (newFocusElement) {
            this.updateSearchIndex(index);
            if (shouldJump) {
                newFocusElement.reveal(true);
            }
            newFocusElement.setSearchRegex(regex, UI.UIUtils.highlightedCurrentSearchResultClassName);
        }
        else {
            this.updateSearchIndex(0);
        }
    }
    updateSearchCount(count) {
        if (!this.searchableView) {
            return;
        }
        this.searchableView.updateSearchMatchesCount(count);
    }
    updateSearchIndex(index) {
        this.currentSearchFocusIndex = index;
        if (!this.searchableView) {
            return;
        }
        this.searchableView.updateCurrentMatchIndex(index);
    }
    innerPerformSearch(shouldJump, jumpBackwards) {
        if (!this.searchConfig) {
            return;
        }
        let newIndex = this.currentSearchFocusIndex;
        const previousSearchFocusElement = this.currentSearchTreeElements[newIndex];
        this.innerSearchCanceled();
        this.currentSearchTreeElements = [];
        const { regex } = this.searchConfig.toSearchRegex(true);
        for (let element = this.treeOutline.rootElement(); element; element = element.traverseNextTreeElement(false)) {
            if (!(element instanceof XMLViewNode)) {
                continue;
            }
            const hasMatch = element.setSearchRegex(regex);
            if (hasMatch) {
                this.currentSearchTreeElements.push(element);
            }
            if (previousSearchFocusElement === element) {
                const currentIndex = this.currentSearchTreeElements.length - 1;
                if (hasMatch || jumpBackwards) {
                    newIndex = currentIndex;
                }
                else {
                    newIndex = currentIndex + 1;
                }
            }
        }
        this.updateSearchCount(this.currentSearchTreeElements.length);
        if (!this.currentSearchTreeElements.length) {
            this.updateSearchIndex(0);
            return;
        }
        newIndex = Platform.NumberUtilities.mod(newIndex, this.currentSearchTreeElements.length);
        this.jumpToMatch(newIndex, shouldJump);
    }
    innerSearchCanceled() {
        for (let element = this.treeOutline.rootElement(); element; element = element.traverseNextTreeElement(false)) {
            if (!(element instanceof XMLViewNode)) {
                continue;
            }
            element.revertHighlightChanges();
        }
        this.updateSearchCount(0);
        this.updateSearchIndex(0);
    }
    searchCanceled() {
        this.searchConfig = null;
        this.currentSearchTreeElements = [];
        this.innerSearchCanceled();
    }
    performSearch(searchConfig, shouldJump, jumpBackwards) {
        this.searchConfig = searchConfig;
        this.innerPerformSearch(shouldJump, jumpBackwards);
    }
    jumpToNextSearchResult() {
        if (!this.currentSearchTreeElements.length) {
            return;
        }
        const newIndex = Platform.NumberUtilities.mod(this.currentSearchFocusIndex + 1, this.currentSearchTreeElements.length);
        this.jumpToMatch(newIndex, true);
    }
    jumpToPreviousSearchResult() {
        if (!this.currentSearchTreeElements.length) {
            return;
        }
        const newIndex = Platform.NumberUtilities.mod(this.currentSearchFocusIndex - 1, this.currentSearchTreeElements.length);
        this.jumpToMatch(newIndex, true);
    }
    supportsCaseSensitiveSearch() {
        return true;
    }
    supportsRegexSearch() {
        return true;
    }
}
export class XMLViewNode extends UI.TreeOutline.TreeElement {
    node;
    closeTag;
    highlightChanges;
    xmlView;
    constructor(node, closeTag, xmlView) {
        super('', !closeTag && 'childElementCount' in node && Boolean(node.childElementCount));
        this.node = node;
        this.closeTag = closeTag;
        this.selectable = true;
        this.highlightChanges = [];
        this.xmlView = xmlView;
        this.updateTitle();
    }
    static populate(root, xmlNode, xmlView) {
        if (!(xmlNode instanceof Node)) {
            return;
        }
        let node = xmlNode.firstChild;
        while (node) {
            const currentNode = node;
            node = node.nextSibling;
            const nodeType = currentNode.nodeType;
            // ignore empty TEXT
            if (nodeType === 3 && currentNode.nodeValue && currentNode.nodeValue.match(/\s+/)) {
                continue;
            }
            // ignore ATTRIBUTE, ENTITY_REFERENCE, ENTITY, DOCUMENT, DOCUMENT_TYPE, DOCUMENT_FRAGMENT, NOTATION
            if ((nodeType !== 1) && (nodeType !== 3) && (nodeType !== 4) && (nodeType !== 7) && (nodeType !== 8)) {
                continue;
            }
            root.appendChild(new XMLViewNode(currentNode, false, xmlView));
        }
    }
    setSearchRegex(regex, additionalCssClassName) {
        this.revertHighlightChanges();
        if (!regex) {
            return false;
        }
        if (this.closeTag && this.parent && !this.parent.expanded) {
            return false;
        }
        regex.lastIndex = 0;
        let cssClasses = UI.UIUtils.highlightedSearchResultClassName;
        if (additionalCssClassName) {
            cssClasses += ' ' + additionalCssClassName;
        }
        if (!this.listItemElement.textContent) {
            return false;
        }
        const content = this.listItemElement.textContent.replace(/\xA0/g, ' ');
        let match = regex.exec(content);
        const ranges = [];
        while (match) {
            ranges.push(new TextUtils.TextRange.SourceRange(match.index, match[0].length));
            match = regex.exec(content);
        }
        if (ranges.length) {
            UI.UIUtils.highlightRangesWithStyleClass(this.listItemElement, ranges, cssClasses, this.highlightChanges);
        }
        return Boolean(this.highlightChanges.length);
    }
    revertHighlightChanges() {
        UI.UIUtils.revertDomChanges(this.highlightChanges);
        this.highlightChanges = [];
    }
    updateTitle() {
        const node = this.node;
        if (!('nodeType' in node)) {
            return;
        }
        switch (node.nodeType) {
            case 1: { // ELEMENT
                if (node instanceof Element) {
                    const tag = node.tagName;
                    if (this.closeTag) {
                        this.setTitle(['</' + tag + '>', 'shadow-xml-view-tag']);
                        return;
                    }
                    const titleItems = ['<' + tag, 'shadow-xml-view-tag'];
                    const attributes = node.attributes;
                    for (let i = 0; i < attributes.length; ++i) {
                        const attributeNode = attributes.item(i);
                        if (!attributeNode) {
                            return;
                        }
                        titleItems.push('\xA0', 'shadow-xml-view-tag', attributeNode.name, 'shadow-xml-view-attribute-name', '="', 'shadow-xml-view-tag', attributeNode.value, 'shadow-xml-view-attribute-value', '"', 'shadow-xml-view-tag');
                    }
                    if (!this.expanded) {
                        if (node.childElementCount) {
                            titleItems.push('>', 'shadow-xml-view-tag', '…', 'shadow-xml-view-comment', '</' + tag, 'shadow-xml-view-tag');
                        }
                        else if (node.textContent) {
                            titleItems.push('>', 'shadow-xml-view-tag', node.textContent, 'shadow-xml-view-text', '</' + tag, 'shadow-xml-view-tag');
                        }
                        else {
                            titleItems.push(' /', 'shadow-xml-view-tag');
                        }
                    }
                    titleItems.push('>', 'shadow-xml-view-tag');
                    this.setTitle(titleItems);
                    return;
                }
                return;
            }
            case 3: { // TEXT
                if (node.nodeValue) {
                    this.setTitle([node.nodeValue, 'shadow-xml-view-text']);
                }
                return;
            }
            case 4: { // CDATA
                if (node.nodeValue) {
                    this.setTitle([
                        '<![CDATA[',
                        'shadow-xml-view-cdata',
                        node.nodeValue,
                        'shadow-xml-view-text',
                        ']]>',
                        'shadow-xml-view-cdata',
                    ]);
                }
                return;
            }
            case 7: { // PROCESSING_INSTRUCTION
                if (node.nodeValue) {
                    this.setTitle(['<?' + node.nodeName + ' ' + node.nodeValue + '?>', 'shadow-xml-view-processing-instruction']);
                }
                return;
            }
            case 8: { // COMMENT
                this.setTitle(['<!--' + node.nodeValue + '-->', 'shadow-xml-view-comment']);
                return;
            }
        }
    }
    setTitle(items) {
        const titleFragment = document.createDocumentFragment();
        for (let i = 0; i < items.length; i += 2) {
            titleFragment.createChild('span', items[i + 1]).textContent = items[i];
        }
        this.title = titleFragment;
        this.xmlView.innerPerformSearch(false, false);
    }
    onattach() {
        this.listItemElement.classList.toggle('shadow-xml-view-close-tag', this.closeTag);
    }
    onexpand() {
        this.updateTitle();
    }
    oncollapse() {
        this.updateTitle();
    }
    async onpopulate() {
        XMLViewNode.populate(this, this.node, this.xmlView);
        this.appendChild(new XMLViewNode(this.node, true, this.xmlView));
    }
}
//# sourceMappingURL=XMLView.js.map