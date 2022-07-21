// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * `document.activeElement` will not enter shadow roots to find the element
 * that has focus; use this method if you need to traverse through any shadow
 * roots to find the actual, specific focused element.
*/
export function deepActiveElement(doc) {
    let activeElement = doc.activeElement;
    while (activeElement && activeElement.shadowRoot && activeElement.shadowRoot.activeElement) {
        activeElement = activeElement.shadowRoot.activeElement;
    }
    return activeElement;
}
//# sourceMappingURL=dom-utilities.js.map