// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../platform/platform.js';
export class WasmDisassembly {
    #offsets;
    #functionBodyOffsets;
    constructor(offsets, functionBodyOffsets) {
        this.#offsets = offsets;
        this.#functionBodyOffsets = functionBodyOffsets;
    }
    get lineNumbers() {
        return this.#offsets.length;
    }
    bytecodeOffsetToLineNumber(bytecodeOffset) {
        return Platform.ArrayUtilities.upperBound(this.#offsets, bytecodeOffset, Platform.ArrayUtilities.DEFAULT_COMPARATOR) -
            1;
    }
    lineNumberToBytecodeOffset(lineNumber) {
        return this.#offsets[lineNumber];
    }
    /**
     * returns an iterable enumerating all the non-breakable line numbers in the disassembly
     */
    *nonBreakableLineNumbers() {
        let lineNumber = 0;
        let functionIndex = 0;
        while (lineNumber < this.lineNumbers) {
            if (functionIndex < this.#functionBodyOffsets.length) {
                const offset = this.lineNumberToBytecodeOffset(lineNumber);
                if (offset >= this.#functionBodyOffsets[functionIndex].start) {
                    lineNumber = this.bytecodeOffsetToLineNumber(this.#functionBodyOffsets[functionIndex++].end) + 1;
                    continue;
                }
            }
            yield lineNumber++;
        }
    }
}
//# sourceMappingURL=WasmDisassembly.js.map