// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { ShortcutRegistry } from './ShortcutRegistry.js';
export class Tooltip {
    static install(element, tooltipContent) {
        element.title = tooltipContent || '';
    }
    static installWithActionBinding(element, tooltipContent, actionId) {
        let description = tooltipContent;
        const shortcuts = ShortcutRegistry.instance().shortcutsForAction(actionId);
        for (const shortcut of shortcuts) {
            description += ` - ${shortcut.title()}`;
        }
        element.title = description;
    }
}
//# sourceMappingURL=Tooltip.js.map