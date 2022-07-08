/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as UI from '../../ui/legacy/legacy.js';
import { LayerSelection } from './LayerViewHost.js';
const UIStrings = {
    /**
    *@description Label for layers sidepanel tree
    */
    layersTreePane: 'Layers Tree Pane',
    /**
    *@description A context menu item in the DView of the Layers panel
    */
    showPaintProfiler: 'Show Paint Profiler',
    /**
    *@description Details text content in Layer Tree Outline of the Layers panel
    *@example {10} PH1
    *@example {10} PH2
    */
    updateChildDimension: ' ({PH1} × {PH2})',
};
const str_ = i18n.i18n.registerUIStrings('panels/layer_viewer/LayerTreeOutline.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class LayerTreeOutline extends Common.ObjectWrapper.eventMixin(UI.TreeOutline.TreeOutline) {
    layerViewHost;
    treeOutline;
    lastHoveredNode;
    element;
    layerTree;
    layerSnapshotMap;
    constructor(layerViewHost) {
        super();
        this.layerViewHost = layerViewHost;
        this.layerViewHost.registerView(this);
        this.treeOutline = new UI.TreeOutline.TreeOutlineInShadow();
        this.treeOutline.element.classList.add('layer-tree', 'overflow-auto');
        this.treeOutline.element.addEventListener('mousemove', this.onMouseMove.bind(this), false);
        this.treeOutline.element.addEventListener('mouseout', this.onMouseMove.bind(this), false);
        this.treeOutline.element.addEventListener('contextmenu', this.onContextMenu.bind(this), true);
        UI.ARIAUtils.setAccessibleName(this.treeOutline.contentElement, i18nString(UIStrings.layersTreePane));
        this.lastHoveredNode = null;
        this.element = this.treeOutline.element;
        this.layerViewHost.showInternalLayersSetting().addChangeListener(this.update, this);
    }
    focus() {
        this.treeOutline.focus();
    }
    selectObject(selection) {
        this.hoverObject(null);
        const layer = selection && selection.layer();
        const node = layer && layerToTreeElement.get(layer);
        if (node) {
            node.revealAndSelect(true);
        }
        else if (this.treeOutline.selectedTreeElement) {
            this.treeOutline.selectedTreeElement.deselect();
        }
    }
    hoverObject(selection) {
        const layer = selection && selection.layer();
        const node = layer && layerToTreeElement.get(layer);
        if (node === this.lastHoveredNode) {
            return;
        }
        if (this.lastHoveredNode) {
            this.lastHoveredNode.setHovered(false);
        }
        if (node) {
            node.setHovered(true);
        }
        this.lastHoveredNode = node;
    }
    setLayerTree(layerTree) {
        this.layerTree = layerTree;
        this.update();
    }
    update() {
        const showInternalLayers = this.layerViewHost.showInternalLayersSetting().get();
        const seenLayers = new Map();
        let root = null;
        if (this.layerTree) {
            if (!showInternalLayers) {
                root = this.layerTree.contentRoot();
            }
            if (!root) {
                root = this.layerTree.root();
            }
        }
        function updateLayer(layer) {
            if (!layer.drawsContent() && !showInternalLayers) {
                return;
            }
            if (seenLayers.get(layer)) {
                console.assert(false, 'Duplicate layer: ' + layer.id());
            }
            seenLayers.set(layer, true);
            let node = layerToTreeElement.get(layer) || null;
            let parentLayer = layer.parent();
            // Skip till nearest visible ancestor.
            while (parentLayer && parentLayer !== root && !parentLayer.drawsContent() && !showInternalLayers) {
                parentLayer = parentLayer.parent();
            }
            const parent = layer === root ? this.treeOutline.rootElement() : parentLayer && layerToTreeElement.get(parentLayer);
            if (!parent) {
                console.assert(false, 'Parent is not in the tree');
                return;
            }
            if (!node) {
                node = new LayerTreeElement(this, layer);
                parent.appendChild(node);
                // Expand all new non-content layers to expose content layers better.
                if (!layer.drawsContent()) {
                    node.expand();
                }
            }
            else {
                if (node.parent !== parent) {
                    const oldSelection = this.treeOutline.selectedTreeElement;
                    if (node.parent) {
                        node.parent.removeChild(node);
                    }
                    parent.appendChild(node);
                    if (oldSelection && oldSelection !== this.treeOutline.selectedTreeElement) {
                        oldSelection.select();
                    }
                }
                node.update();
            }
        }
        if (root && this.layerTree) {
            this.layerTree.forEachLayer(updateLayer.bind(this), root);
        }
        // Cleanup layers that don't exist anymore from tree.
        const rootElement = this.treeOutline.rootElement();
        for (let node = rootElement.firstChild(); node instanceof LayerTreeElement && !node.root;) {
            if (seenLayers.get(node.layer)) {
                node = node.traverseNextTreeElement(false);
            }
            else {
                const nextNode = node.nextSibling || node.parent;
                if (node.parent) {
                    node.parent.removeChild(node);
                }
                if (node === this.lastHoveredNode) {
                    this.lastHoveredNode = null;
                }
                node = nextNode;
            }
        }
        if (!this.treeOutline.selectedTreeElement && this.layerTree) {
            const elementToSelect = this.layerTree.contentRoot() || this.layerTree.root();
            if (elementToSelect) {
                const layer = layerToTreeElement.get(elementToSelect);
                if (layer) {
                    layer.revealAndSelect(true);
                }
            }
        }
    }
    onMouseMove(event) {
        const node = this.treeOutline.treeElementFromEvent(event);
        if (node === this.lastHoveredNode) {
            return;
        }
        this.layerViewHost.hoverObject(this.selectionForNode(node));
    }
    selectedNodeChanged(node) {
        this.layerViewHost.selectObject(this.selectionForNode(node));
    }
    onContextMenu(event) {
        const selection = this.selectionForNode(this.treeOutline.treeElementFromEvent(event));
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        const layer = selection && selection.layer();
        if (layer) {
            this.layerSnapshotMap = this.layerViewHost.getLayerSnapshotMap();
            if (this.layerSnapshotMap.has(layer)) {
                contextMenu.defaultSection().appendItem(i18nString(UIStrings.showPaintProfiler), () => this.dispatchEventToListeners("PaintProfilerRequested" /* PaintProfilerRequested */, selection), false);
            }
        }
        this.layerViewHost.showContextMenu(contextMenu, selection);
    }
    selectionForNode(node) {
        return node && node.layer ? new LayerSelection(node.layer) : null;
    }
}
export class LayerTreeElement extends UI.TreeOutline.TreeElement {
    // Watch out: This is different from treeOutline that
    // LayerTreeElement inherits from UI.TreeOutline.TreeElement.
    treeOutlineInternal;
    layer;
    constructor(tree, layer) {
        super();
        this.treeOutlineInternal = tree;
        this.layer = layer;
        layerToTreeElement.set(layer, this);
        this.update();
    }
    update() {
        const node = this.layer.nodeForSelfOrAncestor();
        const title = document.createDocumentFragment();
        UI.UIUtils.createTextChild(title, node ? node.simpleSelector() : '#' + this.layer.id());
        const details = title.createChild('span', 'dimmed');
        details.textContent =
            i18nString(UIStrings.updateChildDimension, { PH1: this.layer.width(), PH2: this.layer.height() });
        this.title = title;
    }
    onselect() {
        this.treeOutlineInternal.selectedNodeChanged(this);
        return false;
    }
    setHovered(hovered) {
        this.listItemElement.classList.toggle('hovered', hovered);
    }
}
export const layerToTreeElement = new WeakMap();
//# sourceMappingURL=LayerTreeOutline.js.map