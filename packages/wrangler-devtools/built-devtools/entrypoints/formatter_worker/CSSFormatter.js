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
import { createTokenizer } from './FormatterWorker.js';
const cssTrimEnd = (tokenValue) => {
    // https://drafts.csswg.org/css-syntax/#whitespace
    const re = /(?:\r?\n|[\t\f\r ])+$/g;
    return tokenValue.replace(re, '');
};
export class CSSFormatter {
    #builder;
    #toOffset;
    #fromOffset;
    #lineEndings;
    #lastLine;
    #state;
    constructor(builder) {
        this.#builder = builder;
        this.#lastLine = -1;
        this.#state = {
            eatWhitespace: undefined,
            seenProperty: undefined,
            inPropertyValue: undefined,
            afterClosingBrace: undefined,
        };
    }
    format(text, lineEndings, fromOffset, toOffset) {
        this.#lineEndings = lineEndings;
        this.#fromOffset = fromOffset;
        this.#toOffset = toOffset;
        this.#state = {
            eatWhitespace: undefined,
            seenProperty: undefined,
            inPropertyValue: undefined,
            afterClosingBrace: undefined,
        };
        this.#lastLine = -1;
        const tokenize = createTokenizer('text/css');
        const oldEnforce = this.#builder.setEnforceSpaceBetweenWords(false);
        tokenize(text.substring(this.#fromOffset, this.#toOffset), this.#tokenCallback.bind(this));
        this.#builder.setEnforceSpaceBetweenWords(oldEnforce);
    }
    #tokenCallback(token, type, startPosition) {
        startPosition += this.#fromOffset;
        const startLine = Platform.ArrayUtilities.lowerBound(this.#lineEndings, startPosition, Platform.ArrayUtilities.DEFAULT_COMPARATOR);
        if (startLine !== this.#lastLine) {
            this.#state.eatWhitespace = true;
        }
        if (type && (/^property/.test(type) || /^variable-2/.test(type)) && !this.#state.inPropertyValue) {
            this.#state.seenProperty = true;
        }
        this.#lastLine = startLine;
        // https://drafts.csswg.org/css-syntax/#whitespace
        const isWhitespace = /^(?:\r?\n|[\t\f\r ])+$/.test(token);
        if (isWhitespace) {
            if (!this.#state.eatWhitespace) {
                this.#builder.addSoftSpace();
            }
            return;
        }
        this.#state.eatWhitespace = false;
        if (token === '\n') {
            return;
        }
        if (token !== '}') {
            if (this.#state.afterClosingBrace) {
                this.#builder.addNewLine(true);
            }
            this.#state.afterClosingBrace = false;
        }
        if (token === '}') {
            if (this.#state.inPropertyValue) {
                this.#builder.addNewLine();
            }
            this.#builder.decreaseNestingLevel();
            this.#state.afterClosingBrace = true;
            this.#state.inPropertyValue = false;
        }
        else if (token === ':' && !this.#state.inPropertyValue && this.#state.seenProperty) {
            this.#builder.addToken(token, startPosition);
            this.#builder.addSoftSpace();
            this.#state.eatWhitespace = true;
            this.#state.inPropertyValue = true;
            this.#state.seenProperty = false;
            return;
        }
        else if (token === '{') {
            this.#builder.addSoftSpace();
            this.#builder.addToken(token, startPosition);
            this.#builder.addNewLine();
            this.#builder.increaseNestingLevel();
            return;
        }
        this.#builder.addToken(cssTrimEnd(token), startPosition);
        if (type === 'comment' && !this.#state.inPropertyValue && !this.#state.seenProperty) {
            this.#builder.addNewLine();
        }
        if (token === ';' && this.#state.inPropertyValue) {
            this.#state.inPropertyValue = false;
            this.#builder.addNewLine();
        }
        else if (token === '}') {
            this.#builder.addNewLine();
        }
    }
}
//# sourceMappingURL=CSSFormatter.js.map