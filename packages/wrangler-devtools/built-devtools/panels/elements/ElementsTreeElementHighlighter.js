// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import { ElementsTreeElement } from './ElementsTreeElement.js';
import { ElementsTreeOutline } from './ElementsTreeOutline.js';
export class ElementsTreeElementHighlighter {
    throttler;
    treeOutline;
    currentHighlightedElement;
    alreadyExpandedParentElement;
    pendingHighlightNode;
    isModifyingTreeOutline;
    constructor(treeOutline) {
        this.throttler = new Common.Throttler.Throttler(100);
        this.treeOutline = treeOutline;
        this.treeOutline.addEventListener(UI.TreeOutline.Events.ElementExpanded, this.clearState, this);
        this.treeOutline.addEventListener(UI.TreeOutline.Events.ElementCollapsed, this.clearState, this);
        this.treeOutline.addEventListener(ElementsTreeOutline.Events.SelectedNodeChanged, this.clearState, this);
        SDK.TargetManager.TargetManager.instance().addModelListener(SDK.OverlayModel.OverlayModel, SDK.OverlayModel.Events.HighlightNodeRequested, this.highlightNode, this);
        SDK.TargetManager.TargetManager.instance().addModelListener(SDK.OverlayModel.OverlayModel, SDK.OverlayModel.Events.InspectModeWillBeToggled, this.clearState, this);
        this.currentHighlightedElement = null;
        this.alreadyExpandedParentElement = null;
        this.pendingHighlightNode = null;
        this.isModifyingTreeOutline = false;
    }
    highlightNode(event) {
        if (!Common.Settings.Settings.instance().moduleSetting('highlightNodeOnHoverInOverlay').get()) {
            return;
        }
        const domNode = event.data;
        void this.throttler.schedule(async () => {
            this.highlightNodeInternal(this.pendingHighlightNode);
            this.pendingHighlightNode = null;
        });
        this.pendingHighlightNode =
            this.treeOutline === ElementsTreeOutline.forDOMModel(domNode.domModel()) ? domNode : null;
    }
    highlightNodeInternal(node) {
        this.isModifyingTreeOutline = true;
        let treeElement = null;
        if (this.currentHighlightedElement) {
            let currentTreeElement = this.currentHighlightedElement;
            while (currentTreeElement && currentTreeElement !== this.alreadyExpandedParentElement) {
                if (currentTreeElement.expanded) {
                    currentTreeElement.collapse();
                }
                const parent = currentTreeElement.parent;
                currentTreeElement = parent instanceof ElementsTreeElement ? parent : null;
            }
        }
        this.currentHighlightedElement = null;
        this.alreadyExpandedParentElement = null;
        if (node) {
            let deepestExpandedParent = node;
            const treeElementByNode = this.treeOutline.treeElementByNode;
            const treeIsNotExpanded = (deepestExpandedParent) => {
                const element = treeElementByNode.get(deepestExpandedParent);
                return element ? !element.expanded : true;
            };
            while (deepestExpandedParent && treeIsNotExpanded(deepestExpandedParent)) {
                deepestExpandedParent = deepestExpandedParent.parentNode;
            }
            this.alreadyExpandedParentElement =
                deepestExpandedParent ? treeElementByNode.get(deepestExpandedParent) : this.treeOutline.rootElement();
            treeElement = this.treeOutline.createTreeElementFor(node);
        }
        this.currentHighlightedElement = treeElement;
        this.treeOutline.setHoverEffect(treeElement);
        if (treeElement) {
            treeElement.reveal(true);
        }
        this.isModifyingTreeOutline = false;
    }
    clearState() {
        if (this.isModifyingTreeOutline) {
            return;
        }
        this.currentHighlightedElement = null;
        this.alreadyExpandedParentElement = null;
        this.pendingHighlightNode = null;
    }
}
//# sourceMappingURL=ElementsTreeElementHighlighter.js.map