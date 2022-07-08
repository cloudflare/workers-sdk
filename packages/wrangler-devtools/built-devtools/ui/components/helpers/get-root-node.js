// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../../core/platform/platform.js';
/*
 * Function to return the root node of a given node.
 */
export function getRootNode(node) {
    const potentialRoot = node.getRootNode();
    Platform.DCHECK(() => potentialRoot instanceof Document || potentialRoot instanceof ShadowRoot, `Expected root of widget to be a document or shadowRoot, but was "${potentialRoot.nodeName}"`);
    return potentialRoot;
}
//# sourceMappingURL=get-root-node.js.map