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
/* eslint-disable @typescript-eslint/no-unused-vars */
export class Progress {
    setTotalWork(totalWork) {
    }
    setTitle(title) {
    }
    setWorked(worked, title) {
    }
    incrementWorked(worked) {
    }
    done() {
    }
    isCanceled() {
        return false;
    }
}
export class CompositeProgress {
    parent;
    #children;
    #childrenDone;
    constructor(parent) {
        this.parent = parent;
        this.#children = [];
        this.#childrenDone = 0;
        this.parent.setTotalWork(1);
        this.parent.setWorked(0);
    }
    childDone() {
        if (++this.#childrenDone !== this.#children.length) {
            return;
        }
        this.parent.done();
    }
    createSubProgress(weight) {
        const child = new SubProgress(this, weight);
        this.#children.push(child);
        return child;
    }
    update() {
        let totalWeights = 0;
        let done = 0;
        for (let i = 0; i < this.#children.length; ++i) {
            const child = this.#children[i];
            if (child.getTotalWork()) {
                done += child.getWeight() * child.getWorked() / child.getTotalWork();
            }
            totalWeights += child.getWeight();
        }
        this.parent.setWorked(done / totalWeights);
    }
}
export class SubProgress {
    #composite;
    #weight;
    #worked;
    #totalWork;
    constructor(composite, weight) {
        this.#composite = composite;
        this.#weight = weight || 1;
        this.#worked = 0;
        this.#totalWork = 0;
    }
    isCanceled() {
        return this.#composite.parent.isCanceled();
    }
    setTitle(title) {
        this.#composite.parent.setTitle(title);
    }
    done() {
        this.setWorked(this.#totalWork);
        this.#composite.childDone();
    }
    setTotalWork(totalWork) {
        this.#totalWork = totalWork;
        this.#composite.update();
    }
    setWorked(worked, title) {
        this.#worked = worked;
        if (typeof title !== 'undefined') {
            this.setTitle(title);
        }
        this.#composite.update();
    }
    incrementWorked(worked) {
        this.setWorked(this.#worked + (worked || 1));
    }
    getWeight() {
        return this.#weight;
    }
    getWorked() {
        return this.#worked;
    }
    getTotalWork() {
        return this.#totalWork;
    }
}
export class ProgressProxy {
    #delegate;
    #doneCallback;
    constructor(delegate, doneCallback) {
        this.#delegate = delegate;
        this.#doneCallback = doneCallback;
    }
    isCanceled() {
        return this.#delegate ? this.#delegate.isCanceled() : false;
    }
    setTitle(title) {
        if (this.#delegate) {
            this.#delegate.setTitle(title);
        }
    }
    done() {
        if (this.#delegate) {
            this.#delegate.done();
        }
        if (this.#doneCallback) {
            this.#doneCallback();
        }
    }
    setTotalWork(totalWork) {
        if (this.#delegate) {
            this.#delegate.setTotalWork(totalWork);
        }
    }
    setWorked(worked, title) {
        if (this.#delegate) {
            this.#delegate.setWorked(worked, title);
        }
    }
    incrementWorked(worked) {
        if (this.#delegate) {
            this.#delegate.incrementWorked(worked);
        }
    }
}
//# sourceMappingURL=Progress.js.map