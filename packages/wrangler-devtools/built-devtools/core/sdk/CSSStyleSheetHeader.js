// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as TextUtils from '../../models/text_utils/text_utils.js';
import * as Common from '../common/common.js';
import * as i18n from '../i18n/i18n.js';
import * as Platform from '../platform/platform.js';
import * as Root from '../root/root.js';
import { DeferredDOMNode } from './DOMModel.js';
import { ResourceTreeModel } from './ResourceTreeModel.js';
const UIStrings = {
    /**
    *@description Error message for when a CSS file can't be loaded
    */
    couldNotFindTheOriginalStyle: 'Could not find the original style sheet.',
    /**
    *@description Error message to display when a source CSS file could not be retrieved.
    */
    thereWasAnErrorRetrievingThe: 'There was an error retrieving the source styles.',
};
const str_ = i18n.i18n.registerUIStrings('core/sdk/CSSStyleSheetHeader.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class CSSStyleSheetHeader {
    #cssModelInternal;
    id;
    frameId;
    sourceURL;
    hasSourceURL;
    origin;
    title;
    disabled;
    isInline;
    isMutable;
    isConstructed;
    startLine;
    startColumn;
    endLine;
    endColumn;
    contentLength;
    ownerNode;
    sourceMapURL;
    #originalContentProviderInternal;
    constructor(cssModel, payload) {
        this.#cssModelInternal = cssModel;
        this.id = payload.styleSheetId;
        this.frameId = payload.frameId;
        this.sourceURL = payload.sourceURL;
        this.hasSourceURL = Boolean(payload.hasSourceURL);
        this.origin = payload.origin;
        this.title = payload.title;
        this.disabled = payload.disabled;
        this.isInline = payload.isInline;
        this.isMutable = payload.isMutable;
        this.isConstructed = payload.isConstructed;
        this.startLine = payload.startLine;
        this.startColumn = payload.startColumn;
        this.endLine = payload.endLine;
        this.endColumn = payload.endColumn;
        this.contentLength = payload.length;
        if (payload.ownerNode) {
            this.ownerNode = new DeferredDOMNode(cssModel.target(), payload.ownerNode);
        }
        this.sourceMapURL = payload.sourceMapURL;
        this.#originalContentProviderInternal = null;
    }
    originalContentProvider() {
        if (!this.#originalContentProviderInternal) {
            const lazyContent = (async () => {
                const originalText = await this.#cssModelInternal.originalStyleSheetText(this);
                if (originalText === null) {
                    return { content: null, error: i18nString(UIStrings.couldNotFindTheOriginalStyle), isEncoded: false };
                }
                return { content: originalText, isEncoded: false };
            });
            this.#originalContentProviderInternal =
                new TextUtils.StaticContentProvider.StaticContentProvider(this.contentURL(), this.contentType(), lazyContent);
        }
        return this.#originalContentProviderInternal;
    }
    setSourceMapURL(sourceMapURL) {
        this.sourceMapURL = sourceMapURL;
    }
    cssModel() {
        return this.#cssModelInternal;
    }
    isAnonymousInlineStyleSheet() {
        return !this.resourceURL() && !this.#cssModelInternal.sourceMapManager().sourceMapForClient(this);
    }
    isConstructedByNew() {
        return this.isConstructed && this.sourceURL.length === 0;
    }
    resourceURL() {
        const url = this.isViaInspector() ? this.viaInspectorResourceURL() : this.sourceURL;
        if (!url && Root.Runtime.experiments.isEnabled(Root.Runtime.ExperimentName.STYLES_PANE_CSS_CHANGES)) {
            return this.dynamicStyleURL();
        }
        return url;
    }
    getFrameURLPath() {
        const model = this.#cssModelInternal.target().model(ResourceTreeModel);
        console.assert(Boolean(model));
        if (!model) {
            return '';
        }
        const frame = model.frameForId(this.frameId);
        if (!frame) {
            return '';
        }
        console.assert(Boolean(frame));
        const parsedURL = new Common.ParsedURL.ParsedURL(frame.url);
        let urlPath = parsedURL.host + parsedURL.folderPathComponents;
        if (!urlPath.endsWith('/')) {
            urlPath += '/';
        }
        return urlPath;
    }
    viaInspectorResourceURL() {
        return `inspector://${this.getFrameURLPath()}inspector-stylesheet`;
    }
    dynamicStyleURL() {
        return `stylesheet://${this.getFrameURLPath()}style#${this.id}`;
    }
    lineNumberInSource(lineNumberInStyleSheet) {
        return this.startLine + lineNumberInStyleSheet;
    }
    columnNumberInSource(lineNumberInStyleSheet, columnNumberInStyleSheet) {
        return (lineNumberInStyleSheet ? 0 : this.startColumn) + columnNumberInStyleSheet;
    }
    /**
     * Checks whether the position is in this style sheet. Assumes that the
     * position's columnNumber is consistent with line endings.
     */
    containsLocation(lineNumber, columnNumber) {
        const afterStart = (lineNumber === this.startLine && columnNumber >= this.startColumn) || lineNumber > this.startLine;
        const beforeEnd = lineNumber < this.endLine || (lineNumber === this.endLine && columnNumber <= this.endColumn);
        return afterStart && beforeEnd;
    }
    contentURL() {
        return this.resourceURL();
    }
    contentType() {
        return Common.ResourceType.resourceTypes.Stylesheet;
    }
    contentEncoded() {
        return Promise.resolve(false);
    }
    async requestContent() {
        try {
            const cssText = await this.#cssModelInternal.getStyleSheetText(this.id);
            return { content: cssText, isEncoded: false };
        }
        catch (err) {
            return {
                content: null,
                error: i18nString(UIStrings.thereWasAnErrorRetrievingThe),
                isEncoded: false,
            };
        }
    }
    async searchInContent(query, caseSensitive, isRegex) {
        const requestedContent = await this.requestContent();
        if (requestedContent.content === null) {
            return [];
        }
        return TextUtils.TextUtils.performSearchInContent(requestedContent.content, query, caseSensitive, isRegex);
    }
    isViaInspector() {
        return this.origin === 'inspector';
    }
    createPageResourceLoadInitiator() {
        return {
            target: null,
            frameId: this.frameId,
            initiatorUrl: this.hasSourceURL ? Platform.DevToolsPath.EmptyUrlString : this.sourceURL,
        };
    }
}
//# sourceMappingURL=CSSStyleSheetHeader.js.map