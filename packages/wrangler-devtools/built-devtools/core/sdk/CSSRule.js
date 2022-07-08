// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as TextUtils from '../../models/text_utils/text_utils.js';
import * as Platform from '../platform/platform.js';
import { CSSContainerQuery } from './CSSContainerQuery.js';
import { CSSLayer } from './CSSLayer.js';
import { CSSMedia } from './CSSMedia.js';
import { CSSScope } from './CSSScope.js';
import { CSSSupports } from './CSSSupports.js';
import { CSSStyleDeclaration, Type } from './CSSStyleDeclaration.js';
export class CSSRule {
    cssModelInternal;
    styleSheetId;
    sourceURL;
    origin;
    style;
    constructor(cssModel, payload) {
        this.cssModelInternal = cssModel;
        this.styleSheetId = payload.styleSheetId;
        if (this.styleSheetId) {
            const styleSheetHeader = this.getStyleSheetHeader(this.styleSheetId);
            this.sourceURL = styleSheetHeader.sourceURL;
        }
        this.origin = payload.origin;
        this.style = new CSSStyleDeclaration(this.cssModelInternal, this, payload.style, Type.Regular);
    }
    rebase(edit) {
        if (this.styleSheetId !== edit.styleSheetId) {
            return;
        }
        this.style.rebase(edit);
    }
    resourceURL() {
        if (!this.styleSheetId) {
            return Platform.DevToolsPath.EmptyUrlString;
        }
        const styleSheetHeader = this.getStyleSheetHeader(this.styleSheetId);
        return styleSheetHeader.resourceURL();
    }
    isUserAgent() {
        return this.origin === "user-agent" /* UserAgent */;
    }
    isInjected() {
        return this.origin === "injected" /* Injected */;
    }
    isViaInspector() {
        return this.origin === "inspector" /* Inspector */;
    }
    isRegular() {
        return this.origin === "regular" /* Regular */;
    }
    cssModel() {
        return this.cssModelInternal;
    }
    getStyleSheetHeader(styleSheetId) {
        const styleSheetHeader = this.cssModelInternal.styleSheetHeaderForId(styleSheetId);
        console.assert(styleSheetHeader !== null);
        return styleSheetHeader;
    }
}
class CSSValue {
    text;
    range;
    constructor(payload) {
        this.text = payload.text;
        if (payload.range) {
            this.range = TextUtils.TextRange.TextRange.fromObject(payload.range);
        }
    }
    rebase(edit) {
        if (!this.range) {
            return;
        }
        this.range = this.range.rebaseAfterTextEdit(edit.oldRange, edit.newRange);
    }
}
export class CSSStyleRule extends CSSRule {
    selectors;
    media;
    containerQueries;
    supports;
    scopes;
    layers;
    wasUsed;
    constructor(cssModel, payload, wasUsed) {
        // TODO(crbug.com/1011811): Replace with spread operator or better types once Closure is gone.
        super(cssModel, { origin: payload.origin, style: payload.style, styleSheetId: payload.styleSheetId });
        this.reinitializeSelectors(payload.selectorList);
        this.media = payload.media ? CSSMedia.parseMediaArrayPayload(cssModel, payload.media) : [];
        this.containerQueries = payload.containerQueries ?
            CSSContainerQuery.parseContainerQueriesPayload(cssModel, payload.containerQueries) :
            [];
        this.scopes = payload.scopes ? CSSScope.parseScopesPayload(cssModel, payload.scopes) : [];
        this.supports = payload.supports ? CSSSupports.parseSupportsPayload(cssModel, payload.supports) : [];
        this.layers = payload.layers ? CSSLayer.parseLayerPayload(cssModel, payload.layers) : [];
        this.wasUsed = wasUsed || false;
    }
    static createDummyRule(cssModel, selectorText) {
        const dummyPayload = {
            selectorList: {
                text: '',
                selectors: [{ text: selectorText, value: undefined }],
            },
            style: {
                styleSheetId: '0',
                range: new TextUtils.TextRange.TextRange(0, 0, 0, 0),
                shorthandEntries: [],
                cssProperties: [],
            },
            origin: "inspector" /* Inspector */,
        };
        return new CSSStyleRule(cssModel, dummyPayload);
    }
    reinitializeSelectors(selectorList) {
        this.selectors = [];
        for (let i = 0; i < selectorList.selectors.length; ++i) {
            this.selectors.push(new CSSValue(selectorList.selectors[i]));
        }
    }
    setSelectorText(newSelector) {
        const styleSheetId = this.styleSheetId;
        if (!styleSheetId) {
            throw 'No rule stylesheet id';
        }
        const range = this.selectorRange();
        if (!range) {
            throw 'Rule selector is not editable';
        }
        return this.cssModelInternal.setSelectorText(styleSheetId, range, newSelector);
    }
    selectorText() {
        return this.selectors.map(selector => selector.text).join(', ');
    }
    selectorRange() {
        const firstRange = this.selectors[0].range;
        const lastRange = this.selectors[this.selectors.length - 1].range;
        if (!firstRange || !lastRange) {
            return null;
        }
        return new TextUtils.TextRange.TextRange(firstRange.startLine, firstRange.startColumn, lastRange.endLine, lastRange.endColumn);
    }
    lineNumberInSource(selectorIndex) {
        const selector = this.selectors[selectorIndex];
        if (!selector || !selector.range || !this.styleSheetId) {
            return 0;
        }
        const styleSheetHeader = this.getStyleSheetHeader(this.styleSheetId);
        return styleSheetHeader.lineNumberInSource(selector.range.startLine);
    }
    columnNumberInSource(selectorIndex) {
        const selector = this.selectors[selectorIndex];
        if (!selector || !selector.range || !this.styleSheetId) {
            return undefined;
        }
        const styleSheetHeader = this.getStyleSheetHeader(this.styleSheetId);
        return styleSheetHeader.columnNumberInSource(selector.range.startLine, selector.range.startColumn);
    }
    rebase(edit) {
        if (this.styleSheetId !== edit.styleSheetId) {
            return;
        }
        const range = this.selectorRange();
        if (range && range.equal(edit.oldRange)) {
            this.reinitializeSelectors(edit.payload);
        }
        else {
            for (let i = 0; i < this.selectors.length; ++i) {
                this.selectors[i].rebase(edit);
            }
        }
        this.media.forEach(media => media.rebase(edit));
        this.containerQueries.forEach(cq => cq.rebase(edit));
        this.scopes.forEach(scope => scope.rebase(edit));
        this.supports.forEach(supports => supports.rebase(edit));
        super.rebase(edit);
    }
}
export class CSSKeyframesRule {
    #animationName;
    #keyframesInternal;
    constructor(cssModel, payload) {
        this.#animationName = new CSSValue(payload.animationName);
        this.#keyframesInternal = payload.keyframes.map(keyframeRule => new CSSKeyframeRule(cssModel, keyframeRule));
    }
    name() {
        return this.#animationName;
    }
    keyframes() {
        return this.#keyframesInternal;
    }
}
export class CSSKeyframeRule extends CSSRule {
    #keyText;
    constructor(cssModel, payload) {
        // TODO(crbug.com/1011811): Replace with spread operator or better types once Closure is gone.
        super(cssModel, { origin: payload.origin, style: payload.style, styleSheetId: payload.styleSheetId });
        this.reinitializeKey(payload.keyText);
    }
    key() {
        return this.#keyText;
    }
    reinitializeKey(payload) {
        this.#keyText = new CSSValue(payload);
    }
    rebase(edit) {
        if (this.styleSheetId !== edit.styleSheetId || !this.#keyText.range) {
            return;
        }
        if (edit.oldRange.equal(this.#keyText.range)) {
            this.reinitializeKey(edit.payload);
        }
        else {
            this.#keyText.rebase(edit);
        }
        super.rebase(edit);
    }
    setKeyText(newKeyText) {
        const styleSheetId = this.styleSheetId;
        if (!styleSheetId) {
            throw 'No rule stylesheet id';
        }
        const range = this.#keyText.range;
        if (!range) {
            throw 'Keyframe key is not editable';
        }
        return this.cssModelInternal.setKeyframeKey(styleSheetId, range, newKeyText);
    }
}
//# sourceMappingURL=CSSRule.js.map