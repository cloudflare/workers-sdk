// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * Use Mutex class to coordinate local concurrent operations.
 * Once `acquire` promise resolves, you hold the lock and must
 * call `release` function returned by `acquire` to release the
 * lock. Failing to `release` the lock may lead to deadlocks.
 */
export class Mutex {
    #locked = false;
    #acquiringQueue = [];
    acquire() {
        let resolver = (_release) => { };
        const promise = new Promise((resolve) => {
            resolver = resolve;
        });
        this.#acquiringQueue.push(resolver);
        this.#processAcquiringQueue();
        return promise;
    }
    #processAcquiringQueue() {
        if (this.#locked) {
            return;
        }
        const nextAquirePromise = this.#acquiringQueue.shift();
        if (nextAquirePromise) {
            this.#locked = true;
            nextAquirePromise(this.#release.bind(this));
        }
    }
    #release() {
        this.#locked = false;
        this.#processAcquiringQueue();
    }
}
//# sourceMappingURL=Mutex.js.map