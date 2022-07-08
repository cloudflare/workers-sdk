/*
 * Copyright (C) 2010 Google Inc. All rights reserved.
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
// Ideally, we would rely on platform support for parsing a cookie, since
// this would save us from any potential inconsistency. However, exposing
// platform cookie parsing logic would require quite a bit of additional
// plumbing, and at least some platforms lack support for parsing Cookie,
// which is in a format slightly different from Set-Cookie and is normally
// only required on the server side.
import { Cookie, Type } from './Cookie.js';
export class CookieParser {
    #domain;
    #cookiesInternal;
    #input;
    #originalInputLength;
    #lastCookie;
    #lastCookieLine;
    #lastCookiePosition;
    constructor(domain) {
        if (domain) {
            // Handle #domain according to
            // https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis-03#section-5.3.3
            this.#domain = domain.toLowerCase().replace(/^\./, '');
        }
        this.#cookiesInternal = [];
        this.#originalInputLength = 0;
    }
    static parseSetCookie(header, domain) {
        return (new CookieParser(domain)).parseSetCookie(header);
    }
    cookies() {
        return this.#cookiesInternal;
    }
    parseSetCookie(setCookieHeader) {
        if (!this.initialize(setCookieHeader)) {
            return null;
        }
        for (let kv = this.extractKeyValue(); kv; kv = this.extractKeyValue()) {
            if (this.#lastCookie) {
                this.#lastCookie.addAttribute(kv.key, kv.value);
            }
            else {
                this.addCookie(kv, Type.Response);
            }
            if (this.advanceAndCheckCookieDelimiter()) {
                this.flushCookie();
            }
        }
        this.flushCookie();
        return this.#cookiesInternal;
    }
    initialize(headerValue) {
        this.#input = headerValue;
        if (typeof headerValue !== 'string') {
            return false;
        }
        this.#cookiesInternal = [];
        this.#lastCookie = null;
        this.#lastCookieLine = '';
        this.#originalInputLength = this.#input.length;
        return true;
    }
    flushCookie() {
        if (this.#lastCookie) {
            // if we have a last cookie we know that these valeus all exist, hence the typecasts
            this.#lastCookie.setSize(this.#originalInputLength - this.#input.length - this.#lastCookiePosition);
            this.#lastCookie.setCookieLine(this.#lastCookieLine.replace('\n', ''));
        }
        this.#lastCookie = null;
        this.#lastCookieLine = '';
    }
    extractKeyValue() {
        if (!this.#input || !this.#input.length) {
            return null;
        }
        // Note: RFCs offer an option for quoted values that may contain commas and semicolons.
        // Many browsers/platforms do not support this, however (see http://webkit.org/b/16699
        // and http://crbug.com/12361). The logic below matches latest versions of IE, Firefox,
        // Chrome and Safari on some old platforms. The latest version of Safari supports quoted
        // cookie values, though.
        const keyValueMatch = /^[ \t]*([^=;]+)[ \t]*(?:=[ \t]*([^;\n]*))?/.exec(this.#input);
        if (!keyValueMatch) {
            console.error('Failed parsing cookie header before: ' + this.#input);
            return null;
        }
        const result = new KeyValue(keyValueMatch[1] && keyValueMatch[1].trim(), keyValueMatch[2] && keyValueMatch[2].trim(), this.#originalInputLength - this.#input.length);
        this.#lastCookieLine += keyValueMatch[0];
        this.#input = this.#input.slice(keyValueMatch[0].length);
        return result;
    }
    advanceAndCheckCookieDelimiter() {
        if (!this.#input) {
            return false;
        }
        const match = /^\s*[\n;]\s*/.exec(this.#input);
        if (!match) {
            return false;
        }
        this.#lastCookieLine += match[0];
        this.#input = this.#input.slice(match[0].length);
        return match[0].match('\n') !== null;
    }
    addCookie(keyValue, type) {
        if (this.#lastCookie) {
            this.#lastCookie.setSize(keyValue.position - this.#lastCookiePosition);
        }
        // Mozilla bug 169091: Mozilla, IE and Chrome treat single token (w/o "=") as
        // specifying a value for a cookie with empty name.
        this.#lastCookie = typeof keyValue.value === 'string' ? new Cookie(keyValue.key, keyValue.value, type) :
            new Cookie('', keyValue.key, type);
        if (this.#domain) {
            this.#lastCookie.addAttribute('domain', this.#domain);
        }
        this.#lastCookiePosition = keyValue.position;
        this.#cookiesInternal.push(this.#lastCookie);
    }
}
class KeyValue {
    key;
    value;
    position;
    constructor(key, value, position) {
        this.key = key;
        this.value = value;
        this.position = position;
    }
}
//# sourceMappingURL=CookieParser.js.map