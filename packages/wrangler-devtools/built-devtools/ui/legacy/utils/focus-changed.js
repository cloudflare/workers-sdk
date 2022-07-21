// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../../core/platform/platform.js';
// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
// eslint-disable-next-line @typescript-eslint/naming-convention
function WidgetfocusWidgetForNode(node) {
    while (node) {
        if (node.__widget) {
            break;
        }
        node = node.parentNodeOrShadowHost();
    }
    if (!node) {
        return;
    }
    let widget = node.__widget;
    while (widget && widget.parentWidget()) {
        const parentWidget = widget.parentWidget();
        if (!parentWidget) {
            break;
        }
        parentWidget.defaultFocusedChild = widget;
        widget = parentWidget;
    }
}
// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
// eslint-disable-next-line @typescript-eslint/naming-convention
function XWidgetfocusWidgetForNode(node) {
    node = node && node.parentNodeOrShadowHost();
    const XWidgetCtor = customElements.get('x-widget');
    let widget = null;
    while (node) {
        if (XWidgetCtor && node instanceof XWidgetCtor) {
            if (widget) {
                // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                node.defaultFocusedElement = widget;
            }
            widget = node;
        }
        node = node.parentNodeOrShadowHost();
    }
}
export function focusChanged(event) {
    const target = event.target;
    const document = target ? target.ownerDocument : null;
    const element = document ? Platform.DOMUtilities.deepActiveElement(document) : null;
    WidgetfocusWidgetForNode(element);
    XWidgetfocusWidgetForNode(element);
}
//# sourceMappingURL=focus-changed.js.map