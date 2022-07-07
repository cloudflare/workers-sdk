// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Diff from '../../../../third_party/diff/diff.js';
import * as UI from '../../legacy.js';
import { FilteredListWidget, Provider } from './FilteredListWidget.js';
export class QuickPick {
    constructor() {
        throw new ReferenceError('Instance type not implemented.');
    }
    static show(items, options) {
        let canceledPromise = new Promise(_r => { }); // Intentionally creates an unresolved promise
        const fulfilledPromise = new Promise(resolve => {
            const provider = new QuickPickProvider(items, resolve, options.matchOnDescription ? 0.5 : 0, options.matchOnDetail ? 0.25 : 0);
            const widget = new FilteredListWidget(provider);
            widget.setHintElement(options.placeHolder);
            widget.setPromptTitle(options.placeHolder);
            widget.showAsDialog(options.placeHolder);
            canceledPromise = widget.once("hidden" /* Hidden */);
            widget.setQuery('');
        });
        return Promise.race([fulfilledPromise, canceledPromise]).then(values => {
            // If it was fulfilled, then `result` will have a value.
            // If it was canceled, then `result` will be undefined.
            // Either way, it has the value that we want.
            return values;
        });
    }
}
class QuickPickProvider extends Provider {
    resolve;
    items;
    matchOnDescription;
    matchOnDetail;
    constructor(items, resolve, matchOnDescription = 0.5, matchOnDetail = 0.25) {
        super();
        this.resolve = resolve;
        this.items = items;
        this.matchOnDescription = matchOnDescription;
        this.matchOnDetail = matchOnDetail;
    }
    itemCount() {
        return this.items.length;
    }
    itemKeyAt(itemIndex) {
        const item = this.items[itemIndex];
        let key = item.label;
        if (this.matchOnDescription) {
            key += ' ' + item.description;
        }
        if (this.matchOnDetail) {
            key += ' ' + item.detail;
        }
        return key;
    }
    itemScoreAt(itemIndex, query) {
        const item = this.items[itemIndex];
        const test = query.toLowerCase();
        let score = Diff.Diff.DiffWrapper.characterScore(test, item.label.toLowerCase());
        if (this.matchOnDescription && item.description) {
            const descriptionScore = Diff.Diff.DiffWrapper.characterScore(test, item.description.toLowerCase());
            score += descriptionScore * this.matchOnDescription;
        }
        if (this.matchOnDetail && item.detail) {
            const detailScore = Diff.Diff.DiffWrapper.characterScore(test, item.detail.toLowerCase());
            score += detailScore * this.matchOnDetail;
        }
        return score;
    }
    renderItem(itemIndex, query, titleElement, subtitleElement) {
        const item = this.items[itemIndex];
        titleElement.removeChildren();
        const labelElement = titleElement.createChild('span');
        UI.UIUtils.createTextChild(labelElement, item.label);
        FilteredListWidget.highlightRanges(titleElement, query, true);
        if (item.description) {
            const descriptionElement = titleElement.createChild('span', 'quickpick-description');
            UI.UIUtils.createTextChild(descriptionElement, item.description);
            if (this.matchOnDescription) {
                FilteredListWidget.highlightRanges(descriptionElement, query, true);
            }
        }
        if (item.detail) {
            UI.UIUtils.createTextChild(subtitleElement, item.detail);
            if (this.matchOnDetail) {
                FilteredListWidget.highlightRanges(subtitleElement, query, true);
            }
        }
    }
    renderAsTwoRows() {
        return this.items.some(i => Boolean(i.detail));
    }
    selectItem(itemIndex, _promptValue) {
        if (typeof itemIndex === 'number') {
            this.resolve(this.items[itemIndex]);
            return;
        }
        this.resolve(undefined);
    }
}
//# sourceMappingURL=QuickPick.js.map