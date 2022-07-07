/*
 * Copyright (C) 2014 Google Inc. All rights reserved.
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
import * as Workspace from '../../models/workspace/workspace.js';
import * as SourceFrame from '../../ui/legacy/components/source_frame/source_frame.js';
export const HistoryDepth = 20;
export class EditingLocationHistoryManager {
    sourcesView;
    entries = [];
    current = -1;
    revealing = false;
    constructor(sourcesView) {
        this.sourcesView = sourcesView;
    }
    trackSourceFrameCursorJumps(sourceFrame) {
        sourceFrame.addEventListener("EditorUpdate" /* EditorUpdate */, event => this.onEditorUpdate(event.data, sourceFrame));
    }
    onEditorUpdate(update, sourceFrame) {
        if (update.docChanged) {
            this.mapEntriesFor(sourceFrame.uiSourceCode(), update.changes);
        }
        const prevPos = update.startState.selection.main;
        const newPos = update.state.selection.main;
        const isJump = !this.revealing && prevPos.anchor !== newPos.anchor && update.transactions.some((tr) => {
            return Boolean(tr.isUserEvent('select.pointer') || tr.isUserEvent('select.reveal') || tr.isUserEvent('select.search'));
        });
        if (isJump) {
            this.updateCurrentState(sourceFrame.uiSourceCode(), prevPos.head);
            if (this.entries.length > this.current + 1) {
                this.entries.length = this.current + 1;
            }
            this.entries.push(new EditingLocationHistoryEntry(sourceFrame.uiSourceCode(), newPos.head));
            this.current++;
            if (this.entries.length > HistoryDepth) {
                this.entries.shift();
                this.current--;
            }
        }
    }
    updateCurrentState(uiSourceCode, position) {
        if (!this.revealing) {
            const top = this.current >= 0 ? this.entries[this.current] : null;
            if (top?.matches(uiSourceCode)) {
                top.position = position;
            }
        }
    }
    mapEntriesFor(uiSourceCode, change) {
        for (const entry of this.entries) {
            if (entry.matches(uiSourceCode)) {
                entry.position = change.mapPos(entry.position);
            }
        }
    }
    reveal(entry) {
        const uiSourceCode = Workspace.Workspace.WorkspaceImpl.instance().uiSourceCode(entry.projectId, entry.url);
        if (uiSourceCode) {
            this.revealing = true;
            this.sourcesView.showSourceLocation(uiSourceCode, entry.position, false, true);
            this.revealing = false;
        }
    }
    rollback() {
        if (this.current > 0) {
            this.current--;
            this.reveal(this.entries[this.current]);
        }
    }
    rollover() {
        if (this.current < this.entries.length - 1) {
            this.current++;
            this.reveal(this.entries[this.current]);
        }
    }
    removeHistoryForSourceCode(uiSourceCode) {
        for (let i = this.entries.length - 1; i >= 0; i--) {
            if (this.entries[i].matches(uiSourceCode)) {
                this.entries.splice(i, 1);
                if (this.current >= i) {
                    this.current--;
                }
            }
        }
    }
}
class EditingLocationHistoryEntry {
    projectId;
    url;
    position;
    constructor(uiSourceCode, position) {
        this.projectId = uiSourceCode.project().id();
        this.url = uiSourceCode.url();
        this.position = position;
    }
    matches(uiSourceCode) {
        return this.url === uiSourceCode.url() && this.projectId === uiSourceCode.project().id();
    }
}
//# sourceMappingURL=EditingLocationHistoryManager.js.map