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
import { Trie } from './Trie.js';
export class TextDictionary {
    words;
    index;
    constructor() {
        this.words = new Map();
        this.index = new Trie();
    }
    addWord(word) {
        let count = this.words.get(word) || 0;
        ++count;
        this.words.set(word, count);
        this.index.add(word);
    }
    removeWord(word) {
        let count = this.words.get(word) || 0;
        if (!count) {
            return;
        }
        if (count === 1) {
            this.words.delete(word);
            this.index.remove(word);
            return;
        }
        --count;
        this.words.set(word, count);
    }
    wordsWithPrefix(prefix) {
        return this.index.words(prefix);
    }
    hasWord(word) {
        return this.words.has(word);
    }
    wordCount(word) {
        return this.words.get(word) || 0;
    }
    reset() {
        this.words.clear();
        this.index.clear();
    }
}
//# sourceMappingURL=TextDictionary.js.map