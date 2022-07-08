// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import { NetworkGroupNode } from './NetworkDataGridNode.js';
export class NetworkFrameGrouper {
    parentView;
    activeGroups;
    constructor(parentView) {
        this.parentView = parentView;
        this.activeGroups = new Map();
    }
    groupNodeForRequest(request) {
        const frame = SDK.ResourceTreeModel.ResourceTreeModel.frameForRequest(request);
        if (!frame || frame.isTopFrame()) {
            return null;
        }
        let groupNode = this.activeGroups.get(frame);
        if (groupNode) {
            return groupNode;
        }
        groupNode = new FrameGroupNode(this.parentView, frame);
        this.activeGroups.set(frame, groupNode);
        return groupNode;
    }
    reset() {
        this.activeGroups.clear();
    }
}
export class FrameGroupNode extends NetworkGroupNode {
    frame;
    constructor(parentView, frame) {
        super(parentView);
        this.frame = frame;
    }
    displayName() {
        return new Common.ParsedURL.ParsedURL(this.frame.url).domain() || this.frame.name || '<iframe>';
    }
    renderCell(cell, columnId) {
        super.renderCell(cell, columnId);
        const columnIndex = this.dataGrid.indexOfVisibleColumn(columnId);
        if (columnIndex === 0) {
            const name = this.displayName();
            cell.appendChild(UI.Icon.Icon.create('largeicon-navigator-frame', 'network-frame-group-icon'));
            UI.UIUtils.createTextChild(cell, name);
            UI.Tooltip.Tooltip.install(cell, name);
            this.setCellAccessibleName(cell.textContent || '', cell, columnId);
        }
    }
}
//# sourceMappingURL=NetworkFrameGrouper.js.map