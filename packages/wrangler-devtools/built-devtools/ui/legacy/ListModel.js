// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
export class ListModel extends Common.ObjectWrapper.ObjectWrapper {
    items;
    constructor(items) {
        super();
        this.items = items || [];
    }
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [Symbol.iterator]() {
        return this.items[Symbol.iterator]();
    }
    get length() {
        return this.items.length;
    }
    at(index) {
        return this.items[index];
    }
    every(callback) {
        return this.items.every(callback);
    }
    filter(callback) {
        return this.items.filter(callback);
    }
    find(callback) {
        return this.items.find(callback);
    }
    findIndex(callback) {
        return this.items.findIndex(callback);
    }
    indexOf(value, fromIndex) {
        return this.items.indexOf(value, fromIndex);
    }
    insert(index, value) {
        this.items.splice(index, 0, value);
        this.replaced(index, [], 1);
    }
    insertWithComparator(value, comparator) {
        this.insert(Platform.ArrayUtilities.lowerBound(this.items, value, comparator), value);
    }
    join(separator) {
        return this.items.join(separator);
    }
    remove(index) {
        const result = this.items[index];
        this.items.splice(index, 1);
        this.replaced(index, [result], 0);
        return result;
    }
    replace(index, value, keepSelectedIndex) {
        const oldValue = this.items[index];
        this.items[index] = value;
        this.replaced(index, [oldValue], 1, keepSelectedIndex);
        return oldValue;
    }
    replaceRange(from, to, items) {
        let removed;
        if (items.length < 10000) {
            removed = this.items.splice(from, to - from, ...items);
        }
        else {
            removed = this.items.slice(from, to);
            // Splice may fail with too many arguments.
            const before = this.items.slice(0, from);
            const after = this.items.slice(to);
            this.items = [...before, ...items, ...after];
        }
        this.replaced(from, removed, items.length);
        return removed;
    }
    replaceAll(items) {
        const oldItems = this.items.slice();
        this.items = items;
        this.replaced(0, oldItems, items.length);
        return oldItems;
    }
    slice(from, to) {
        return this.items.slice(from, to);
    }
    some(callback) {
        return this.items.some(callback);
    }
    replaced(index, removed, inserted, keepSelectedIndex) {
        this.dispatchEventToListeners(Events.ItemsReplaced, { index, removed, inserted, keepSelectedIndex });
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["ItemsReplaced"] = "ItemsReplaced";
})(Events || (Events = {}));
//# sourceMappingURL=ListModel.js.map