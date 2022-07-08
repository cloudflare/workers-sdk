// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { Keys } from './KeyboardShortcut.js';
import * as Utils from './utils/utils.js';
// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
// eslint-disable-next-line @typescript-eslint/naming-convention
let _constructor = null;
export class HistoryInput extends HTMLInputElement {
    history;
    historyPosition;
    constructor() {
        super();
        this.history = [''];
        this.historyPosition = 0;
        this.addEventListener('keydown', this.onKeyDown.bind(this), false);
        this.addEventListener('input', this.onInput.bind(this), false);
    }
    static create() {
        if (!_constructor) {
            _constructor = Utils.registerCustomElement('input', 'history-input', HistoryInput);
        }
        return _constructor();
    }
    onInput(_event) {
        if (this.history.length === this.historyPosition + 1) {
            this.history[this.history.length - 1] = this.value;
        }
    }
    onKeyDown(ev) {
        const event = ev;
        if (event.keyCode === Keys.Up.code) {
            this.historyPosition = Math.max(this.historyPosition - 1, 0);
            this.value = this.history[this.historyPosition];
            this.dispatchEvent(new Event('input', { 'bubbles': true, 'cancelable': true }));
            event.consume(true);
        }
        else if (event.keyCode === Keys.Down.code) {
            this.historyPosition = Math.min(this.historyPosition + 1, this.history.length - 1);
            this.value = this.history[this.historyPosition];
            this.dispatchEvent(new Event('input', { 'bubbles': true, 'cancelable': true }));
            event.consume(true);
        }
        else if (event.keyCode === Keys.Enter.code) {
            this.saveToHistory();
        }
    }
    saveToHistory() {
        if (this.history.length > 1 && this.history[this.history.length - 2] === this.value) {
            return;
        }
        this.history[this.history.length - 1] = this.value;
        this.historyPosition = this.history.length - 1;
        this.history.push('');
    }
}
//# sourceMappingURL=HistoryInput.js.map