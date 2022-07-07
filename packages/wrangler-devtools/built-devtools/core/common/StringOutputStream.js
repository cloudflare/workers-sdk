// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export class StringOutputStream {
    #dataInternal;
    constructor() {
        this.#dataInternal = '';
    }
    async write(chunk) {
        this.#dataInternal += chunk;
    }
    async close() {
    }
    data() {
        return this.#dataInternal;
    }
}
//# sourceMappingURL=StringOutputStream.js.map