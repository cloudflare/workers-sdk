// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export class Trie {
    #size;
    #root;
    #edges;
    #isWord;
    #wordsInSubtree;
    #freeNodes;
    constructor() {
        this.#root = 0;
        this.clear();
    }
    add(word) {
        let node = this.#root;
        ++this.#wordsInSubtree[this.#root];
        for (let i = 0; i < word.length; ++i) {
            const edge = word[i];
            let next = this.#edges[node][edge];
            if (!next) {
                if (this.#freeNodes.length) {
                    next = this.#freeNodes.pop();
                }
                else {
                    next = this.#size++;
                    this.#isWord.push(false);
                    this.#wordsInSubtree.push(0);
                    this.#edges.push(Object.create(null));
                }
                this.#edges[node][edge] = next;
            }
            ++this.#wordsInSubtree[next];
            node = next;
        }
        this.#isWord[node] = true;
    }
    remove(word) {
        if (!this.has(word)) {
            return false;
        }
        let node = this.#root;
        --this.#wordsInSubtree[this.#root];
        for (let i = 0; i < word.length; ++i) {
            const edge = word[i];
            const next = this.#edges[node][edge];
            if (!--this.#wordsInSubtree[next]) {
                delete this.#edges[node][edge];
                this.#freeNodes.push(next);
            }
            node = next;
        }
        this.#isWord[node] = false;
        return true;
    }
    has(word) {
        let node = this.#root;
        for (let i = 0; i < word.length; ++i) {
            node = this.#edges[node][word[i]];
            if (!node) {
                return false;
            }
        }
        return this.#isWord[node];
    }
    words(prefix) {
        prefix = prefix || '';
        let node = this.#root;
        for (let i = 0; i < prefix.length; ++i) {
            node = this.#edges[node][prefix[i]];
            if (!node) {
                return [];
            }
        }
        const results = [];
        this.dfs(node, prefix, results);
        return results;
    }
    dfs(node, prefix, results) {
        if (this.#isWord[node]) {
            results.push(prefix);
        }
        const edges = this.#edges[node];
        for (const edge in edges) {
            this.dfs(edges[edge], prefix + edge, results);
        }
    }
    longestPrefix(word, fullWordOnly) {
        let node = this.#root;
        let wordIndex = 0;
        for (let i = 0; i < word.length; ++i) {
            node = this.#edges[node][word[i]];
            if (!node) {
                break;
            }
            if (!fullWordOnly || this.#isWord[node]) {
                wordIndex = i + 1;
            }
        }
        return word.substring(0, wordIndex);
    }
    clear() {
        this.#size = 1;
        this.#root = 0;
        this.#edges = [Object.create(null)];
        this.#isWord = [false];
        this.#wordsInSubtree = [0];
        this.#freeNodes = [];
    }
}
//# sourceMappingURL=Trie.js.map