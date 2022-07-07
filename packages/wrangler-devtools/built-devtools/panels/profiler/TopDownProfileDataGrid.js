// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { ProfileDataGridNode, ProfileDataGridTree } from './ProfileDataGrid.js';
export class TopDownProfileDataGridNode extends ProfileDataGridNode {
    remainingChildren;
    constructor(profileNode, owningTree) {
        const hasChildren = Boolean(profileNode.children && profileNode.children.length);
        super(profileNode, owningTree, hasChildren);
        this.remainingChildren = profileNode.children;
    }
    static sharedPopulate(container) {
        const children = container.remainingChildren;
        const childrenLength = children.length;
        for (let i = 0; i < childrenLength; ++i) {
            container.appendChild(new TopDownProfileDataGridNode(children[i], container.tree));
        }
        container.remainingChildren = [];
    }
    static excludeRecursively(container, aCallUID) {
        if (container.remainingChildren.length > 0) {
            container.populate();
        }
        container.save();
        const children = container.children;
        let index = container.children.length;
        while (index--) {
            TopDownProfileDataGridNode.excludeRecursively(children[index], aCallUID);
        }
        const child = container.childrenByCallUID.get(aCallUID);
        if (child) {
            ProfileDataGridNode.merge(container, child, true);
        }
    }
    populateChildren() {
        TopDownProfileDataGridNode.sharedPopulate(this);
    }
}
export class TopDownProfileDataGridTree extends ProfileDataGridTree {
    remainingChildren;
    constructor(formatter, searchableView, rootProfileNode, total) {
        super(formatter, searchableView, total);
        this.remainingChildren = rootProfileNode.children;
        ProfileDataGridNode.populate(this);
    }
    focus(profileDataGridNode) {
        if (!profileDataGridNode) {
            return;
        }
        this.save();
        profileDataGridNode.savePosition();
        this.children = [profileDataGridNode];
        this.total = profileDataGridNode.total;
    }
    exclude(profileDataGridNode) {
        if (!profileDataGridNode) {
            return;
        }
        this.save();
        TopDownProfileDataGridNode.excludeRecursively(this, profileDataGridNode.callUID);
        if (this.lastComparator) {
            this.sort(this.lastComparator, true);
        }
    }
    restore() {
        if (!this.savedChildren) {
            return;
        }
        this.children[0].restorePosition();
        super.restore();
    }
    populateChildren() {
        TopDownProfileDataGridNode.sharedPopulate(this);
    }
}
//# sourceMappingURL=TopDownProfileDataGrid.js.map