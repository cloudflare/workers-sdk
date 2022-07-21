// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as SDK from '../../../core/sdk/sdk.js';
export const legacyNodeToElementsComponentsNode = (node) => {
    return {
        parentNode: node.parentNode ? legacyNodeToElementsComponentsNode(node.parentNode) : null,
        id: node.id,
        nodeType: node.nodeType(),
        pseudoType: node.pseudoType(),
        shadowRootType: node.shadowRootType(),
        nodeName: node.nodeName(),
        nodeNameNicelyCased: node.nodeNameInCorrectCase(),
        legacyDomNode: node,
        highlightNode: (mode) => node.highlight(mode),
        clearHighlight: () => SDK.OverlayModel.OverlayModel.hideDOMNodeHighlight(),
        getAttribute: node.getAttribute.bind(node),
    };
};
//# sourceMappingURL=Helper.js.map