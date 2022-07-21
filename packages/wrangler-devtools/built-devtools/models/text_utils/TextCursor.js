// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../core/platform/platform.js';
export class TextCursor {
    lineEndings;
    offsetInternal;
    lineNumberInternal;
    columnNumberInternal;
    constructor(lineEndings) {
        this.lineEndings = lineEndings;
        this.offsetInternal = 0;
        this.lineNumberInternal = 0;
        this.columnNumberInternal = 0;
    }
    advance(offset) {
        this.offsetInternal = offset;
        while (this.lineNumberInternal < this.lineEndings.length &&
            this.lineEndings[this.lineNumberInternal] < this.offsetInternal) {
            ++this.lineNumberInternal;
        }
        this.columnNumberInternal = this.lineNumberInternal ?
            this.offsetInternal - this.lineEndings[this.lineNumberInternal - 1] - 1 :
            this.offsetInternal;
    }
    offset() {
        return this.offsetInternal;
    }
    resetTo(offset) {
        this.offsetInternal = offset;
        this.lineNumberInternal =
            Platform.ArrayUtilities.lowerBound(this.lineEndings, offset, Platform.ArrayUtilities.DEFAULT_COMPARATOR);
        this.columnNumberInternal = this.lineNumberInternal ?
            this.offsetInternal - this.lineEndings[this.lineNumberInternal - 1] - 1 :
            this.offsetInternal;
    }
    lineNumber() {
        return this.lineNumberInternal;
    }
    columnNumber() {
        return this.columnNumberInternal;
    }
}
//# sourceMappingURL=TextCursor.js.map