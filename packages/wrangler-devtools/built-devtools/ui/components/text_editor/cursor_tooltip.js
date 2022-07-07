// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as CodeMirror from '../../../third_party/codemirror.next/codemirror.next.js';
export const closeTooltip = CodeMirror.StateEffect.define();
export function cursorTooltip(source) {
    const openTooltip = CodeMirror.StateEffect.define();
    const state = CodeMirror.StateField.define({
        create() {
            return null;
        },
        update(val, tr) {
            if (tr.selection) {
                val = null;
            }
            if (val && !tr.changes.empty) {
                const newPos = tr.changes.mapPos(val.pos, -1, CodeMirror.MapMode.TrackDel);
                val = newPos === null ? null : { pos: newPos, create: val.create, above: true };
            }
            for (const effect of tr.effects) {
                if (effect.is(openTooltip)) {
                    val = { pos: tr.state.selection.main.from, create: effect.value, above: true };
                }
                else if (effect.is(closeTooltip)) {
                    val = null;
                }
            }
            return val;
        },
        provide: field => CodeMirror.showTooltip.from(field),
    });
    const plugin = CodeMirror.ViewPlugin.fromClass(class {
        pending = -1;
        updateID = 0;
        update(update) {
            this.updateID++;
            if (update.transactions.some(tr => tr.selection) && update.state.selection.main.empty) {
                this.#scheduleUpdate(update.view);
            }
        }
        #scheduleUpdate(view) {
            if (this.pending > -1) {
                clearTimeout(this.pending);
            }
            this.pending = window.setTimeout(() => this.#startUpdate(view), 50);
        }
        #startUpdate(view) {
            this.pending = -1;
            const { main } = view.state.selection;
            if (main.empty) {
                const { updateID } = this;
                void source(view.state, main.from).then(tooltip => {
                    if (this.updateID !== updateID) {
                        if (this.pending < 0) {
                            this.#scheduleUpdate(view);
                        }
                    }
                    else if (tooltip) {
                        view.dispatch({ effects: openTooltip.of(tooltip) });
                    }
                    else {
                        view.dispatch({ effects: closeTooltip.of(null) });
                    }
                });
            }
        }
    });
    return [state, plugin];
}
//# sourceMappingURL=cursor_tooltip.js.map