// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { DeferredDOMNode } from './DOMModel.js';
import { Capability } from './Target.js';
import { SDKModel } from './SDKModel.js';
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var CoreAxPropertyName;
(function (CoreAxPropertyName) {
    CoreAxPropertyName["Name"] = "name";
    CoreAxPropertyName["Description"] = "description";
    CoreAxPropertyName["Value"] = "value";
    CoreAxPropertyName["Role"] = "role";
})(CoreAxPropertyName || (CoreAxPropertyName = {}));
export class AccessibilityNode {
    #accessibilityModelInternal;
    #idInternal;
    #backendDOMNodeIdInternal;
    #deferredDOMNodeInternal;
    #ignoredInternal;
    #ignoredReasonsInternal;
    #roleInternal;
    #nameInternal;
    #descriptionInternal;
    #valueInternal;
    #propertiesInternal;
    #parentId;
    #frameId;
    #childIds;
    constructor(accessibilityModel, payload) {
        this.#accessibilityModelInternal = accessibilityModel;
        this.#idInternal = payload.nodeId;
        accessibilityModel.setAXNodeForAXId(this.#idInternal, this);
        if (payload.backendDOMNodeId) {
            accessibilityModel.setAXNodeForBackendDOMNodeId(payload.backendDOMNodeId, this);
            this.#backendDOMNodeIdInternal = payload.backendDOMNodeId;
            this.#deferredDOMNodeInternal = new DeferredDOMNode(accessibilityModel.target(), payload.backendDOMNodeId);
        }
        else {
            this.#backendDOMNodeIdInternal = null;
            this.#deferredDOMNodeInternal = null;
        }
        this.#ignoredInternal = payload.ignored;
        if (this.#ignoredInternal && 'ignoredReasons' in payload) {
            this.#ignoredReasonsInternal = payload.ignoredReasons;
        }
        this.#roleInternal = payload.role || null;
        this.#nameInternal = payload.name || null;
        this.#descriptionInternal = payload.description || null;
        this.#valueInternal = payload.value || null;
        this.#propertiesInternal = payload.properties || null;
        this.#childIds = payload.childIds || null;
        this.#parentId = payload.parentId || null;
        if (payload.frameId && !payload.parentId) {
            this.#frameId = payload.frameId;
            accessibilityModel.setRootAXNodeForFrameId(payload.frameId, this);
        }
        else {
            this.#frameId = null;
        }
    }
    id() {
        return this.#idInternal;
    }
    accessibilityModel() {
        return this.#accessibilityModelInternal;
    }
    ignored() {
        return this.#ignoredInternal;
    }
    ignoredReasons() {
        return this.#ignoredReasonsInternal || null;
    }
    role() {
        return this.#roleInternal || null;
    }
    coreProperties() {
        const properties = [];
        if (this.#nameInternal) {
            properties.push({ name: CoreAxPropertyName.Name, value: this.#nameInternal });
        }
        if (this.#descriptionInternal) {
            properties.push({ name: CoreAxPropertyName.Description, value: this.#descriptionInternal });
        }
        if (this.#valueInternal) {
            properties.push({ name: CoreAxPropertyName.Value, value: this.#valueInternal });
        }
        return properties;
    }
    name() {
        return this.#nameInternal || null;
    }
    description() {
        return this.#descriptionInternal || null;
    }
    value() {
        return this.#valueInternal || null;
    }
    properties() {
        return this.#propertiesInternal || null;
    }
    parentNode() {
        if (this.#parentId) {
            return this.#accessibilityModelInternal.axNodeForId(this.#parentId);
        }
        return null;
    }
    isDOMNode() {
        return Boolean(this.#backendDOMNodeIdInternal);
    }
    backendDOMNodeId() {
        return this.#backendDOMNodeIdInternal;
    }
    deferredDOMNode() {
        return this.#deferredDOMNodeInternal;
    }
    highlightDOMNode() {
        const deferredNode = this.deferredDOMNode();
        if (!deferredNode) {
            return;
        }
        // Highlight node in page.
        deferredNode.highlight();
    }
    children() {
        if (!this.#childIds) {
            return [];
        }
        const children = [];
        for (const childId of this.#childIds) {
            const child = this.#accessibilityModelInternal.axNodeForId(childId);
            if (child) {
                children.push(child);
            }
        }
        return children;
    }
    numChildren() {
        if (!this.#childIds) {
            return 0;
        }
        return this.#childIds.length;
    }
    hasOnlyUnloadedChildren() {
        if (!this.#childIds || !this.#childIds.length) {
            return false;
        }
        return this.#childIds.every(id => this.#accessibilityModelInternal.axNodeForId(id) === null);
    }
    hasUnloadedChildren() {
        if (!this.#childIds || !this.#childIds.length) {
            return false;
        }
        return this.#childIds.some(id => this.#accessibilityModelInternal.axNodeForId(id) === null);
    }
    // Only the root node gets a frameId, so nodes have to walk up the tree to find their frameId.
    getFrameId() {
        return this.#frameId || this.parentNode()?.getFrameId() || null;
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["TreeUpdated"] = "TreeUpdated";
})(Events || (Events = {}));
export class AccessibilityModel extends SDKModel {
    agent;
    #axIdToAXNode;
    #backendDOMNodeIdToAXNode;
    #frameIdToAXNode;
    #pendingChildRequests;
    #root;
    constructor(target) {
        super(target);
        target.registerAccessibilityDispatcher(this);
        this.agent = target.accessibilityAgent();
        void this.resumeModel();
        this.#axIdToAXNode = new Map();
        this.#backendDOMNodeIdToAXNode = new Map();
        this.#frameIdToAXNode = new Map();
        this.#pendingChildRequests = new Map();
        this.#root = null;
    }
    clear() {
        this.#root = null;
        this.#axIdToAXNode.clear();
        this.#backendDOMNodeIdToAXNode.clear();
        this.#frameIdToAXNode.clear();
    }
    async resumeModel() {
        await this.agent.invoke_enable();
    }
    async suspendModel() {
        await this.agent.invoke_disable();
    }
    async requestPartialAXTree(node) {
        const { nodes } = await this.agent.invoke_getPartialAXTree({ nodeId: node.id, fetchRelatives: true });
        if (!nodes) {
            return;
        }
        const axNodes = [];
        for (const payload of nodes) {
            axNodes.push(new AccessibilityNode(this, payload));
        }
    }
    loadComplete({ root }) {
        this.clear();
        this.#root = new AccessibilityNode(this, root);
        this.dispatchEventToListeners(Events.TreeUpdated, { root: this.#root });
    }
    nodesUpdated({ nodes }) {
        this.createNodesFromPayload(nodes);
        this.dispatchEventToListeners(Events.TreeUpdated, {});
        return;
    }
    createNodesFromPayload(payloadNodes) {
        const accessibilityNodes = payloadNodes.map(node => {
            const sdkNode = new AccessibilityNode(this, node);
            return sdkNode;
        });
        return accessibilityNodes;
    }
    async requestRootNode(frameId) {
        if (frameId && this.#frameIdToAXNode.has(frameId)) {
            return this.#frameIdToAXNode.get(frameId);
        }
        if (!frameId && this.#root) {
            return this.#root;
        }
        const { node } = await this.agent.invoke_getRootAXNode({ frameId });
        if (!node) {
            return;
        }
        return this.createNodesFromPayload([node])[0];
    }
    async requestAXChildren(nodeId, frameId) {
        const parent = this.#axIdToAXNode.get(nodeId);
        if (!parent) {
            throw Error('Cannot request children before parent');
        }
        if (!parent.hasUnloadedChildren()) {
            return parent.children();
        }
        const request = this.#pendingChildRequests.get(nodeId);
        if (request) {
            await request;
        }
        else {
            const request = this.agent.invoke_getChildAXNodes({ id: nodeId, frameId });
            this.#pendingChildRequests.set(nodeId, request);
            const result = await request;
            if (!result.getError()) {
                this.createNodesFromPayload(result.nodes);
                this.#pendingChildRequests.delete(nodeId);
            }
        }
        return parent.children();
    }
    async requestAndLoadSubTreeToNode(node) {
        // Node may have already been loaded, so don't bother requesting it again.
        const result = [];
        let ancestor = this.axNodeForDOMNode(node);
        while (ancestor) {
            result.push(ancestor);
            const parent = ancestor.parentNode();
            if (!parent) {
                return result;
            }
            ancestor = parent;
        }
        const { nodes } = await this.agent.invoke_getAXNodeAndAncestors({ backendNodeId: node.backendNodeId() });
        if (!nodes) {
            return null;
        }
        const ancestors = this.createNodesFromPayload(nodes);
        return ancestors;
    }
    axNodeForId(axId) {
        return this.#axIdToAXNode.get(axId) || null;
    }
    setRootAXNodeForFrameId(frameId, axNode) {
        this.#frameIdToAXNode.set(frameId, axNode);
    }
    axNodeForFrameId(frameId) {
        return this.#frameIdToAXNode.get(frameId) ?? null;
    }
    setAXNodeForAXId(axId, axNode) {
        this.#axIdToAXNode.set(axId, axNode);
    }
    axNodeForDOMNode(domNode) {
        if (!domNode) {
            return null;
        }
        return this.#backendDOMNodeIdToAXNode.get(domNode.backendNodeId()) ?? null;
    }
    setAXNodeForBackendDOMNodeId(backendDOMNodeId, axNode) {
        this.#backendDOMNodeIdToAXNode.set(backendDOMNodeId, axNode);
    }
    getAgent() {
        return this.agent;
    }
}
SDKModel.register(AccessibilityModel, { capabilities: Capability.DOM, autostart: false });
//# sourceMappingURL=AccessibilityModel.js.map