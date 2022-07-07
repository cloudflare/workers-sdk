/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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
import * as Utils from './utils/utils.js';
import progressIndicatorStyles from './progressIndicator.css.legacy.js';
export class ProgressIndicator {
    element;
    shadowRoot;
    contentElement;
    labelElement;
    progressElement;
    stopButton;
    isCanceledInternal;
    worked;
    isDone;
    constructor() {
        this.element = document.createElement('div');
        this.element.classList.add('progress-indicator');
        this.shadowRoot = Utils.createShadowRootWithCoreStyles(this.element, { cssFile: progressIndicatorStyles, delegatesFocus: undefined });
        this.contentElement = this.shadowRoot.createChild('div', 'progress-indicator-shadow-container');
        this.labelElement = this.contentElement.createChild('div', 'title');
        this.progressElement = this.contentElement.createChild('progress');
        this.progressElement.value = 0;
        this.stopButton = this.contentElement.createChild('button', 'progress-indicator-shadow-stop-button');
        this.stopButton.addEventListener('click', this.cancel.bind(this));
        this.isCanceledInternal = false;
        this.worked = 0;
    }
    show(parent) {
        parent.appendChild(this.element);
    }
    done() {
        if (this.isDone) {
            return;
        }
        this.isDone = true;
        this.element.remove();
    }
    cancel() {
        this.isCanceledInternal = true;
    }
    isCanceled() {
        return this.isCanceledInternal;
    }
    setTitle(title) {
        this.labelElement.textContent = title;
    }
    setTotalWork(totalWork) {
        this.progressElement.max = totalWork;
    }
    setWorked(worked, title) {
        this.worked = worked;
        this.progressElement.value = worked;
        if (title) {
            this.setTitle(title);
        }
    }
    incrementWorked(worked) {
        this.setWorked(this.worked + (worked || 1));
    }
}
//# sourceMappingURL=ProgressIndicator.js.map