// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as TextUtils from '../../models/text_utils/text_utils.js';
import { CSSQuery } from './CSSQuery.js';
export class CSSMediaQuery {
    #activeInternal;
    #expressionsInternal;
    constructor(payload) {
        this.#activeInternal = payload.active;
        this.#expressionsInternal = [];
        for (let j = 0; j < payload.expressions.length; ++j) {
            this.#expressionsInternal.push(CSSMediaQueryExpression.parsePayload(payload.expressions[j]));
        }
    }
    static parsePayload(payload) {
        return new CSSMediaQuery(payload);
    }
    active() {
        return this.#activeInternal;
    }
    expressions() {
        return this.#expressionsInternal;
    }
}
export class CSSMediaQueryExpression {
    #valueInternal;
    #unitInternal;
    #featureInternal;
    #valueRangeInternal;
    #computedLengthInternal;
    constructor(payload) {
        this.#valueInternal = payload.value;
        this.#unitInternal = payload.unit;
        this.#featureInternal = payload.feature;
        this.#valueRangeInternal = payload.valueRange ? TextUtils.TextRange.TextRange.fromObject(payload.valueRange) : null;
        this.#computedLengthInternal = payload.computedLength || null;
    }
    static parsePayload(payload) {
        return new CSSMediaQueryExpression(payload);
    }
    value() {
        return this.#valueInternal;
    }
    unit() {
        return this.#unitInternal;
    }
    feature() {
        return this.#featureInternal;
    }
    valueRange() {
        return this.#valueRangeInternal;
    }
    computedLength() {
        return this.#computedLengthInternal;
    }
}
export class CSSMedia extends CSSQuery {
    source;
    sourceURL;
    mediaList;
    static parseMediaArrayPayload(cssModel, payload) {
        return payload.map(mq => new CSSMedia(cssModel, mq));
    }
    constructor(cssModel, payload) {
        super(cssModel);
        this.reinitialize(payload);
    }
    reinitialize(payload) {
        this.text = payload.text;
        this.source = payload.source;
        this.sourceURL = payload.sourceURL || '';
        this.range = payload.range ? TextUtils.TextRange.TextRange.fromObject(payload.range) : null;
        this.styleSheetId = payload.styleSheetId;
        this.mediaList = null;
        if (payload.mediaList) {
            this.mediaList = [];
            for (let i = 0; i < payload.mediaList.length; ++i) {
                this.mediaList.push(CSSMediaQuery.parsePayload(payload.mediaList[i]));
            }
        }
    }
    active() {
        if (!this.mediaList) {
            return true;
        }
        for (let i = 0; i < this.mediaList.length; ++i) {
            if (this.mediaList[i].active()) {
                return true;
            }
        }
        return false;
    }
}
export const Source = {
    LINKED_SHEET: 'linkedSheet',
    INLINE_SHEET: 'inlineSheet',
    MEDIA_RULE: 'mediaRule',
    IMPORT_RULE: 'importRule',
};
//# sourceMappingURL=CSSMedia.js.map