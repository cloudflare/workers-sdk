// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as SDK from '../../core/sdk/sdk.js';
import * as TreeOutline from '../../ui/components/tree_outline/tree_outline.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as AccessibilityTreeUtils from './AccessibilityTreeUtils.js';
import { ElementsPanel } from './ElementsPanel.js';
export class AccessibilityTreeView extends UI.Widget.VBox {
    accessibilityTreeComponent = new TreeOutline.TreeOutline.TreeOutline();
    toggleButton;
    inspectedDOMNode = null;
    root = null;
    constructor(toggleButton) {
        super();
        // toggleButton is bound to a click handler on ElementsPanel to switch between the DOM tree
        // and accessibility tree views.
        this.toggleButton = toggleButton;
        this.contentElement.appendChild(this.toggleButton);
        this.contentElement.appendChild(this.accessibilityTreeComponent);
        SDK.TargetManager.TargetManager.instance().observeModels(SDK.AccessibilityModel.AccessibilityModel, this);
        // The DOM tree and accessibility are kept in sync as much as possible, so
        // on node selection, update the currently inspected node and reveal in the
        // DOM tree.
        this.accessibilityTreeComponent.addEventListener('itemselected', (event) => {
            const evt = event;
            const axNode = evt.data.node.treeNodeData;
            if (!axNode.isDOMNode()) {
                return;
            }
            const deferredNode = axNode.deferredDOMNode();
            if (deferredNode) {
                deferredNode.resolve(domNode => {
                    if (domNode) {
                        this.inspectedDOMNode = domNode;
                        void ElementsPanel.instance().revealAndSelectNode(domNode, true, false);
                    }
                });
            }
        });
        this.accessibilityTreeComponent.addEventListener('itemmouseover', (event) => {
            const evt = event;
            evt.data.node.treeNodeData.highlightDOMNode();
        });
        this.accessibilityTreeComponent.addEventListener('itemmouseout', () => {
            SDK.OverlayModel.OverlayModel.hideDOMNodeHighlight();
        });
    }
    async wasShown() {
        await this.refreshAccessibilityTree();
        if (this.inspectedDOMNode) {
            await this.loadSubTreeIntoAccessibilityModel(this.inspectedDOMNode);
        }
    }
    async refreshAccessibilityTree() {
        if (!this.root) {
            const frameId = SDK.FrameManager.FrameManager.instance().getTopFrame()?.id;
            if (!frameId) {
                throw Error('No top frame');
            }
            this.root = await AccessibilityTreeUtils.getRootNode(frameId);
            if (!this.root) {
                throw Error('No root');
            }
        }
        await this.renderTree();
        await this.accessibilityTreeComponent.expandRecursively(1);
    }
    async renderTree() {
        if (!this.root) {
            return;
        }
        const treeData = await AccessibilityTreeUtils.sdkNodeToAXTreeNodes(this.root);
        this.accessibilityTreeComponent.data = {
            defaultRenderer: AccessibilityTreeUtils.accessibilityNodeRenderer,
            tree: treeData,
            filter: (node) => {
                return node.ignored() || (node.role()?.value === 'generic' && !node.name()?.value) ?
                    "FLATTEN" /* FLATTEN */ :
                    "SHOW" /* SHOW */;
            },
        };
    }
    // Given a selected DOM node, asks the model to load the missing subtree from the root to the
    // selected node and then re-renders the tree.
    async loadSubTreeIntoAccessibilityModel(selectedNode) {
        const ancestors = await AccessibilityTreeUtils.getNodeAndAncestorsFromDOMNode(selectedNode);
        const inspectedAXNode = ancestors.find(node => node.backendDOMNodeId() === selectedNode.backendNodeId());
        if (!inspectedAXNode) {
            return;
        }
        await this.accessibilityTreeComponent.expandNodeIds(ancestors.map(node => node.getFrameId() + '#' + node.id()));
        await this.accessibilityTreeComponent.focusNodeId(AccessibilityTreeUtils.getNodeId(inspectedAXNode));
    }
    // A node was revealed through the elements picker.
    async revealAndSelectNode(inspectedNode) {
        if (inspectedNode === this.inspectedDOMNode) {
            return;
        }
        this.inspectedDOMNode = inspectedNode;
        // We only want to load nodes into the model when the AccessibilityTree is visible.
        if (this.isShowing()) {
            await this.loadSubTreeIntoAccessibilityModel(inspectedNode);
        }
    }
    // Selected node in the DOM tree has changed.
    async selectedNodeChanged(inspectedNode) {
        if (this.isShowing() || (inspectedNode === this.inspectedDOMNode)) {
            return;
        }
        if (inspectedNode.ownerDocument && (inspectedNode.nodeName() === 'HTML' || inspectedNode.nodeName() === 'BODY')) {
            this.inspectedDOMNode = inspectedNode.ownerDocument;
        }
        else {
            this.inspectedDOMNode = inspectedNode;
        }
    }
    treeUpdated({ data }) {
        if (!data.root) {
            void this.renderTree();
            return;
        }
        const topFrameId = SDK.FrameManager.FrameManager.instance().getTopFrame()?.id;
        if (data.root?.getFrameId() !== topFrameId) {
            void this.renderTree();
            return;
        }
        this.root = data.root;
        void this.accessibilityTreeComponent.collapseAllNodes();
        void this.refreshAccessibilityTree();
    }
    modelAdded(model) {
        model.addEventListener(SDK.AccessibilityModel.Events.TreeUpdated, this.treeUpdated, this);
    }
    modelRemoved(model) {
        model.removeEventListener(SDK.AccessibilityModel.Events.TreeUpdated, this.treeUpdated, this);
    }
}
//# sourceMappingURL=AccessibilityTreeView.js.map