// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../core/platform/platform.js';
export class FilterSuggestionBuilder {
    keys;
    valueSorter;
    valuesMap;
    constructor(keys, valueSorter) {
        this.keys = keys;
        this.valueSorter = valueSorter || ((key, result) => result.sort());
        this.valuesMap = new Map();
    }
    completions(expression, prefix, force) {
        if (!prefix && !force) {
            return Promise.resolve([]);
        }
        const negative = prefix.startsWith('-');
        if (negative) {
            prefix = prefix.substring(1);
        }
        const modifier = negative ? '-' : '';
        const valueDelimiterIndex = prefix.indexOf(':');
        const suggestions = [];
        if (valueDelimiterIndex === -1) {
            const matcher = new RegExp('^' + Platform.StringUtilities.escapeForRegExp(prefix), 'i');
            for (const key of this.keys) {
                if (matcher.test(key)) {
                    suggestions.push({ text: modifier + key + ':' });
                }
            }
        }
        else {
            const key = prefix.substring(0, valueDelimiterIndex).toLowerCase();
            const value = prefix.substring(valueDelimiterIndex + 1);
            const matcher = new RegExp('^' + Platform.StringUtilities.escapeForRegExp(value), 'i');
            const values = Array.from(this.valuesMap.get(key) || new Set());
            this.valueSorter(key, values);
            for (const item of values) {
                if (matcher.test(item) && (item !== value)) {
                    suggestions.push({ text: modifier + key + ':' + item });
                }
            }
        }
        return Promise.resolve(suggestions);
    }
    addItem(key, value) {
        if (!value) {
            return;
        }
        let set = this.valuesMap.get(key);
        if (!set) {
            set = new Set();
            this.valuesMap.set(key, set);
        }
        set.add(value);
    }
    clear() {
        this.valuesMap.clear();
    }
}
//# sourceMappingURL=FilterSuggestionBuilder.js.map