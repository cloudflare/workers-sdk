// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
 * Copyright (C) 2009, 2010 Google Inc. All rights reserved.
 * Copyright (C) 2009 Joseph Pecoraro
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
 *     * Neither the #name of Google Inc. nor the names of its
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
import * as Common from '../common/common.js';
import * as Host from '../host/host.js';
import * as Platform from '../platform/platform.js';
import * as Root from '../root/root.js';
import { CSSModel } from './CSSModel.js';
import { FrameManager } from './FrameManager.js';
import { OverlayModel } from './OverlayModel.js';
import { RuntimeModel } from './RuntimeModel.js';
import { Capability } from './Target.js';
import { SDKModel } from './SDKModel.js';
import { TargetManager } from './TargetManager.js';
import { ResourceTreeModel } from './ResourceTreeModel.js';
export class DOMNode {
    #domModelInternal;
    #agent;
    ownerDocument;
    #isInShadowTreeInternal;
    id;
    index;
    #backendNodeIdInternal;
    #nodeTypeInternal;
    #nodeNameInternal;
    #localNameInternal;
    nodeValueInternal;
    #pseudoTypeInternal;
    #pseudoIdentifier;
    #shadowRootTypeInternal;
    #frameOwnerFrameIdInternal;
    #xmlVersion;
    #isSVGNodeInternal;
    #creationStackTraceInternal;
    #pseudoElements;
    #distributedNodesInternal;
    assignedSlot;
    shadowRootsInternal;
    #attributesInternal;
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    #markers;
    #subtreeMarkerCount;
    childNodeCountInternal;
    childrenInternal;
    nextSibling;
    previousSibling;
    firstChild;
    lastChild;
    parentNode;
    templateContentInternal;
    contentDocumentInternal;
    childDocumentPromiseForTesting;
    #importedDocumentInternal;
    publicId;
    systemId;
    internalSubset;
    name;
    value;
    constructor(domModel) {
        this.#domModelInternal = domModel;
        this.#agent = this.#domModelInternal.getAgent();
        this.index = undefined;
        this.#creationStackTraceInternal = null;
        this.#pseudoElements = new Map();
        this.#distributedNodesInternal = [];
        this.assignedSlot = null;
        this.shadowRootsInternal = [];
        this.#attributesInternal = new Map();
        this.#markers = new Map();
        this.#subtreeMarkerCount = 0;
        this.childrenInternal = null;
        this.nextSibling = null;
        this.previousSibling = null;
        this.firstChild = null;
        this.lastChild = null;
        this.parentNode = null;
    }
    static create(domModel, doc, isInShadowTree, payload) {
        const node = new DOMNode(domModel);
        node.init(doc, isInShadowTree, payload);
        return node;
    }
    init(doc, isInShadowTree, payload) {
        this.#agent = this.#domModelInternal.getAgent();
        this.ownerDocument = doc;
        this.#isInShadowTreeInternal = isInShadowTree;
        this.id = payload.nodeId;
        this.#backendNodeIdInternal = payload.backendNodeId;
        this.#domModelInternal.registerNode(this);
        this.#nodeTypeInternal = payload.nodeType;
        this.#nodeNameInternal = payload.nodeName;
        this.#localNameInternal = payload.localName;
        this.nodeValueInternal = payload.nodeValue;
        this.#pseudoTypeInternal = payload.pseudoType;
        this.#pseudoIdentifier = payload.pseudoIdentifier;
        this.#shadowRootTypeInternal = payload.shadowRootType;
        this.#frameOwnerFrameIdInternal = payload.frameId || null;
        this.#xmlVersion = payload.xmlVersion;
        this.#isSVGNodeInternal = Boolean(payload.isSVG);
        if (payload.attributes) {
            this.setAttributesPayload(payload.attributes);
        }
        this.childNodeCountInternal = payload.childNodeCount || 0;
        if (payload.shadowRoots) {
            for (let i = 0; i < payload.shadowRoots.length; ++i) {
                const root = payload.shadowRoots[i];
                const node = DOMNode.create(this.#domModelInternal, this.ownerDocument, true, root);
                this.shadowRootsInternal.push(node);
                node.parentNode = this;
            }
        }
        if (payload.templateContent) {
            this.templateContentInternal =
                DOMNode.create(this.#domModelInternal, this.ownerDocument, true, payload.templateContent);
            this.templateContentInternal.parentNode = this;
            this.childrenInternal = [];
        }
        const frameOwnerTags = new Set(['EMBED', 'IFRAME', 'OBJECT', 'PORTAL', 'FENCEDFRAME']);
        if (payload.contentDocument) {
            this.contentDocumentInternal = new DOMDocument(this.#domModelInternal, payload.contentDocument);
            this.contentDocumentInternal.parentNode = this;
            this.childrenInternal = [];
        }
        else if (payload.frameId && frameOwnerTags.has(payload.nodeName)) {
            // At this point we know we are in an OOPIF, otherwise `payload.contentDocument` would have been set.
            this.childDocumentPromiseForTesting = this.requestChildDocument(payload.frameId, this.#domModelInternal.target());
            this.childrenInternal = [];
        }
        if (payload.importedDocument) {
            this.#importedDocumentInternal =
                DOMNode.create(this.#domModelInternal, this.ownerDocument, true, payload.importedDocument);
            this.#importedDocumentInternal.parentNode = this;
            this.childrenInternal = [];
        }
        if (payload.distributedNodes) {
            this.setDistributedNodePayloads(payload.distributedNodes);
        }
        if (payload.assignedSlot) {
            this.setAssignedSlot(payload.assignedSlot);
        }
        if (payload.children) {
            this.setChildrenPayload(payload.children);
        }
        this.setPseudoElements(payload.pseudoElements);
        if (this.#nodeTypeInternal === Node.ELEMENT_NODE) {
            // HTML and BODY from internal iframes should not overwrite top-level ones.
            if (this.ownerDocument && !this.ownerDocument.documentElement && this.#nodeNameInternal === 'HTML') {
                this.ownerDocument.documentElement = this;
            }
            if (this.ownerDocument && !this.ownerDocument.body && this.#nodeNameInternal === 'BODY') {
                this.ownerDocument.body = this;
            }
        }
        else if (this.#nodeTypeInternal === Node.DOCUMENT_TYPE_NODE) {
            this.publicId = payload.publicId;
            this.systemId = payload.systemId;
            this.internalSubset = payload.internalSubset;
        }
        else if (this.#nodeTypeInternal === Node.ATTRIBUTE_NODE) {
            this.name = payload.name;
            this.value = payload.value;
        }
    }
    async requestChildDocument(frameId, notInTarget) {
        const frame = await FrameManager.instance().getOrWaitForFrame(frameId, notInTarget);
        const childModel = frame.resourceTreeModel()?.target().model(DOMModel);
        return childModel?.requestDocument() || null;
    }
    isAdFrameNode() {
        if (this.isIframe() && this.#frameOwnerFrameIdInternal) {
            const frame = FrameManager.instance().getFrame(this.#frameOwnerFrameIdInternal);
            if (!frame) {
                return false;
            }
            return frame.adFrameType() !== "none" /* None */;
        }
        return false;
    }
    isSVGNode() {
        return this.#isSVGNodeInternal;
    }
    creationStackTrace() {
        if (this.#creationStackTraceInternal) {
            return this.#creationStackTraceInternal;
        }
        const stackTracesPromise = this.#agent.invoke_getNodeStackTraces({ nodeId: this.id });
        this.#creationStackTraceInternal = stackTracesPromise.then(res => res.creation || null);
        return this.#creationStackTraceInternal;
    }
    get subtreeMarkerCount() {
        return this.#subtreeMarkerCount;
    }
    domModel() {
        return this.#domModelInternal;
    }
    backendNodeId() {
        return this.#backendNodeIdInternal;
    }
    children() {
        return this.childrenInternal ? this.childrenInternal.slice() : null;
    }
    setChildren(children) {
        this.childrenInternal = children;
    }
    hasAttributes() {
        return this.#attributesInternal.size > 0;
    }
    childNodeCount() {
        return this.childNodeCountInternal;
    }
    setChildNodeCount(childNodeCount) {
        this.childNodeCountInternal = childNodeCount;
    }
    hasShadowRoots() {
        return Boolean(this.shadowRootsInternal.length);
    }
    shadowRoots() {
        return this.shadowRootsInternal.slice();
    }
    templateContent() {
        return this.templateContentInternal || null;
    }
    contentDocument() {
        return this.contentDocumentInternal || null;
    }
    setContentDocument(node) {
        this.contentDocumentInternal = node;
    }
    isIframe() {
        return this.#nodeNameInternal === 'IFRAME';
    }
    isPortal() {
        return this.#nodeNameInternal === 'PORTAL';
    }
    importedDocument() {
        return this.#importedDocumentInternal || null;
    }
    nodeType() {
        return this.#nodeTypeInternal;
    }
    nodeName() {
        return this.#nodeNameInternal;
    }
    pseudoType() {
        return this.#pseudoTypeInternal;
    }
    pseudoIdentifier() {
        return this.#pseudoIdentifier;
    }
    hasPseudoElements() {
        return this.#pseudoElements.size > 0;
    }
    pseudoElements() {
        return this.#pseudoElements;
    }
    beforePseudoElement() {
        return this.#pseudoElements.get(DOMNode.PseudoElementNames.Before)?.at(-1);
    }
    afterPseudoElement() {
        return this.#pseudoElements.get(DOMNode.PseudoElementNames.After)?.at(-1);
    }
    markerPseudoElement() {
        return this.#pseudoElements.get(DOMNode.PseudoElementNames.Marker)?.at(-1);
    }
    pageTransitionPseudoElements() {
        return [
            ...this.#pseudoElements.get(DOMNode.PseudoElementNames.PageTransition) || [],
            ...this.#pseudoElements.get(DOMNode.PseudoElementNames.PageTransitionContainer) || [],
            ...this.#pseudoElements.get(DOMNode.PseudoElementNames.PageTransitionImageWrapper) || [],
            ...this.#pseudoElements.get(DOMNode.PseudoElementNames.PageTransitionOutgoingImage) || [],
            ...this.#pseudoElements.get(DOMNode.PseudoElementNames.PageTransitionIncomingImage) || [],
        ];
    }
    hasAssignedSlot() {
        return this.assignedSlot !== null;
    }
    isInsertionPoint() {
        return !this.isXMLNode() &&
            (this.#nodeNameInternal === 'SHADOW' || this.#nodeNameInternal === 'CONTENT' ||
                this.#nodeNameInternal === 'SLOT');
    }
    distributedNodes() {
        return this.#distributedNodesInternal;
    }
    isInShadowTree() {
        return this.#isInShadowTreeInternal;
    }
    ancestorShadowHost() {
        const ancestorShadowRoot = this.ancestorShadowRoot();
        return ancestorShadowRoot ? ancestorShadowRoot.parentNode : null;
    }
    ancestorShadowRoot() {
        if (!this.#isInShadowTreeInternal) {
            return null;
        }
        let current = this;
        while (current && !current.isShadowRoot()) {
            current = current.parentNode;
        }
        return current;
    }
    ancestorUserAgentShadowRoot() {
        const ancestorShadowRoot = this.ancestorShadowRoot();
        if (!ancestorShadowRoot) {
            return null;
        }
        return ancestorShadowRoot.shadowRootType() === DOMNode.ShadowRootTypes.UserAgent ? ancestorShadowRoot : null;
    }
    isShadowRoot() {
        return Boolean(this.#shadowRootTypeInternal);
    }
    shadowRootType() {
        return this.#shadowRootTypeInternal || null;
    }
    nodeNameInCorrectCase() {
        const shadowRootType = this.shadowRootType();
        if (shadowRootType) {
            return '#shadow-root (' + shadowRootType + ')';
        }
        // If there is no local #name, it's case sensitive
        if (!this.localName()) {
            return this.nodeName();
        }
        // If the names are different lengths, there is a prefix and it's case sensitive
        if (this.localName().length !== this.nodeName().length) {
            return this.nodeName();
        }
        // Return the localname, which will be case insensitive if its an html node
        return this.localName();
    }
    setNodeName(name, callback) {
        void this.#agent.invoke_setNodeName({ nodeId: this.id, name }).then(response => {
            if (!response.getError()) {
                this.#domModelInternal.markUndoableState();
            }
            if (callback) {
                callback(response.getError() || null, this.#domModelInternal.nodeForId(response.nodeId));
            }
        });
    }
    localName() {
        return this.#localNameInternal;
    }
    nodeValue() {
        return this.nodeValueInternal;
    }
    setNodeValueInternal(nodeValue) {
        this.nodeValueInternal = nodeValue;
    }
    setNodeValue(value, callback) {
        void this.#agent.invoke_setNodeValue({ nodeId: this.id, value }).then(response => {
            if (!response.getError()) {
                this.#domModelInternal.markUndoableState();
            }
            if (callback) {
                callback(response.getError() || null);
            }
        });
    }
    getAttribute(name) {
        const attr = this.#attributesInternal.get(name);
        return attr ? attr.value : undefined;
    }
    setAttribute(name, text, callback) {
        void this.#agent.invoke_setAttributesAsText({ nodeId: this.id, text, name }).then(response => {
            if (!response.getError()) {
                this.#domModelInternal.markUndoableState();
            }
            if (callback) {
                callback(response.getError() || null);
            }
        });
    }
    setAttributeValue(name, value, callback) {
        void this.#agent.invoke_setAttributeValue({ nodeId: this.id, name, value }).then(response => {
            if (!response.getError()) {
                this.#domModelInternal.markUndoableState();
            }
            if (callback) {
                callback(response.getError() || null);
            }
        });
    }
    setAttributeValuePromise(name, value) {
        return new Promise(fulfill => this.setAttributeValue(name, value, fulfill));
    }
    attributes() {
        return [...this.#attributesInternal.values()];
    }
    async removeAttribute(name) {
        const response = await this.#agent.invoke_removeAttribute({ nodeId: this.id, name });
        if (response.getError()) {
            return;
        }
        this.#attributesInternal.delete(name);
        this.#domModelInternal.markUndoableState();
    }
    getChildNodes(callback) {
        if (this.childrenInternal) {
            callback(this.children());
            return;
        }
        void this.#agent.invoke_requestChildNodes({ nodeId: this.id }).then(response => {
            callback(response.getError() ? null : this.children());
        });
    }
    async getSubtree(depth, pierce) {
        const response = await this.#agent.invoke_requestChildNodes({ nodeId: this.id, depth: depth, pierce: pierce });
        return response.getError() ? null : this.childrenInternal;
    }
    async getOuterHTML() {
        const { outerHTML } = await this.#agent.invoke_getOuterHTML({ nodeId: this.id });
        return outerHTML;
    }
    setOuterHTML(html, callback) {
        void this.#agent.invoke_setOuterHTML({ nodeId: this.id, outerHTML: html }).then(response => {
            if (!response.getError()) {
                this.#domModelInternal.markUndoableState();
            }
            if (callback) {
                callback(response.getError() || null);
            }
        });
    }
    removeNode(callback) {
        return this.#agent.invoke_removeNode({ nodeId: this.id }).then(response => {
            if (!response.getError()) {
                this.#domModelInternal.markUndoableState();
            }
            if (callback) {
                callback(response.getError() || null);
            }
        });
    }
    async copyNode() {
        const { outerHTML } = await this.#agent.invoke_getOuterHTML({ nodeId: this.id });
        if (outerHTML !== null) {
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(outerHTML);
        }
        return outerHTML;
    }
    path() {
        function canPush(node) {
            return (node.index !== undefined || (node.isShadowRoot() && node.parentNode)) && node.#nodeNameInternal.length;
        }
        const path = [];
        let node = this;
        while (node && canPush(node)) {
            const index = typeof node.index === 'number' ?
                node.index :
                (node.shadowRootType() === DOMNode.ShadowRootTypes.UserAgent ? 'u' : 'a');
            path.push([index, node.#nodeNameInternal]);
            node = node.parentNode;
        }
        path.reverse();
        return path.join(',');
    }
    isAncestor(node) {
        if (!node) {
            return false;
        }
        let currentNode = node.parentNode;
        while (currentNode) {
            if (this === currentNode) {
                return true;
            }
            currentNode = currentNode.parentNode;
        }
        return false;
    }
    isDescendant(descendant) {
        return descendant !== null && descendant.isAncestor(this);
    }
    frameOwnerFrameId() {
        return this.#frameOwnerFrameIdInternal;
    }
    frameId() {
        let node = this.parentNode || this;
        while (!node.#frameOwnerFrameIdInternal && node.parentNode) {
            node = node.parentNode;
        }
        return node.#frameOwnerFrameIdInternal;
    }
    setAttributesPayload(attrs) {
        let attributesChanged = !this.#attributesInternal || attrs.length !== this.#attributesInternal.size * 2;
        const oldAttributesMap = this.#attributesInternal || new Map();
        this.#attributesInternal = new Map();
        for (let i = 0; i < attrs.length; i += 2) {
            const name = attrs[i];
            const value = attrs[i + 1];
            this.addAttribute(name, value);
            if (attributesChanged) {
                continue;
            }
            const oldAttribute = oldAttributesMap.get(name);
            if (!oldAttribute || oldAttribute.value !== value) {
                attributesChanged = true;
            }
        }
        return attributesChanged;
    }
    insertChild(prev, payload) {
        if (!this.childrenInternal) {
            throw new Error('DOMNode._children is expected to not be null.');
        }
        const node = DOMNode.create(this.#domModelInternal, this.ownerDocument, this.#isInShadowTreeInternal, payload);
        this.childrenInternal.splice(prev ? this.childrenInternal.indexOf(prev) + 1 : 0, 0, node);
        this.renumber();
        return node;
    }
    removeChild(node) {
        const pseudoType = node.pseudoType();
        if (pseudoType) {
            const updatedPseudoElements = this.#pseudoElements.get(pseudoType)?.filter(element => element !== node);
            if (updatedPseudoElements && updatedPseudoElements.length > 0) {
                this.#pseudoElements.set(pseudoType, updatedPseudoElements);
            }
            else {
                this.#pseudoElements.delete(pseudoType);
            }
        }
        else {
            const shadowRootIndex = this.shadowRootsInternal.indexOf(node);
            if (shadowRootIndex !== -1) {
                this.shadowRootsInternal.splice(shadowRootIndex, 1);
            }
            else {
                if (!this.childrenInternal) {
                    throw new Error('DOMNode._children is expected to not be null.');
                }
                if (this.childrenInternal.indexOf(node) === -1) {
                    throw new Error('DOMNode._children is expected to contain the node to be removed.');
                }
                this.childrenInternal.splice(this.childrenInternal.indexOf(node), 1);
            }
        }
        node.parentNode = null;
        this.#subtreeMarkerCount -= node.#subtreeMarkerCount;
        if (node.#subtreeMarkerCount) {
            this.#domModelInternal.dispatchEventToListeners(Events.MarkersChanged, this);
        }
        this.renumber();
    }
    setChildrenPayload(payloads) {
        this.childrenInternal = [];
        for (let i = 0; i < payloads.length; ++i) {
            const payload = payloads[i];
            const node = DOMNode.create(this.#domModelInternal, this.ownerDocument, this.#isInShadowTreeInternal, payload);
            this.childrenInternal.push(node);
        }
        this.renumber();
    }
    setPseudoElements(payloads) {
        if (!payloads) {
            return;
        }
        for (let i = 0; i < payloads.length; ++i) {
            const node = DOMNode.create(this.#domModelInternal, this.ownerDocument, this.#isInShadowTreeInternal, payloads[i]);
            node.parentNode = this;
            const pseudoType = node.pseudoType();
            if (!pseudoType) {
                throw new Error('DOMNode.pseudoType() is expected to be defined.');
            }
            const currentPseudoElements = this.#pseudoElements.get(pseudoType);
            if (currentPseudoElements) {
                currentPseudoElements.push(node);
            }
            else {
                this.#pseudoElements.set(pseudoType, [node]);
            }
        }
    }
    setDistributedNodePayloads(payloads) {
        this.#distributedNodesInternal = [];
        for (const payload of payloads) {
            this.#distributedNodesInternal.push(new DOMNodeShortcut(this.#domModelInternal.target(), payload.backendNodeId, payload.nodeType, payload.nodeName));
        }
    }
    setAssignedSlot(payload) {
        this.assignedSlot =
            new DOMNodeShortcut(this.#domModelInternal.target(), payload.backendNodeId, payload.nodeType, payload.nodeName);
    }
    renumber() {
        if (!this.childrenInternal) {
            throw new Error('DOMNode._children is expected to not be null.');
        }
        this.childNodeCountInternal = this.childrenInternal.length;
        if (this.childNodeCountInternal === 0) {
            this.firstChild = null;
            this.lastChild = null;
            return;
        }
        this.firstChild = this.childrenInternal[0];
        this.lastChild = this.childrenInternal[this.childNodeCountInternal - 1];
        for (let i = 0; i < this.childNodeCountInternal; ++i) {
            const child = this.childrenInternal[i];
            child.index = i;
            child.nextSibling = i + 1 < this.childNodeCountInternal ? this.childrenInternal[i + 1] : null;
            child.previousSibling = i - 1 >= 0 ? this.childrenInternal[i - 1] : null;
            child.parentNode = this;
        }
    }
    addAttribute(name, value) {
        const attr = { name: name, value: value, _node: this };
        this.#attributesInternal.set(name, attr);
    }
    setAttributeInternal(name, value) {
        const attr = this.#attributesInternal.get(name);
        if (attr) {
            attr.value = value;
        }
        else {
            this.addAttribute(name, value);
        }
    }
    removeAttributeInternal(name) {
        this.#attributesInternal.delete(name);
    }
    copyTo(targetNode, anchorNode, callback) {
        void this.#agent
            .invoke_copyTo({ nodeId: this.id, targetNodeId: targetNode.id, insertBeforeNodeId: anchorNode ? anchorNode.id : undefined })
            .then(response => {
            if (!response.getError()) {
                this.#domModelInternal.markUndoableState();
            }
            if (callback) {
                callback(response.getError() || null, this.#domModelInternal.nodeForId(response.nodeId));
            }
        });
    }
    moveTo(targetNode, anchorNode, callback) {
        void this.#agent
            .invoke_moveTo({ nodeId: this.id, targetNodeId: targetNode.id, insertBeforeNodeId: anchorNode ? anchorNode.id : undefined })
            .then(response => {
            if (!response.getError()) {
                this.#domModelInternal.markUndoableState();
            }
            if (callback) {
                callback(response.getError() || null, this.#domModelInternal.nodeForId(response.nodeId));
            }
        });
    }
    isXMLNode() {
        return Boolean(this.#xmlVersion);
    }
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setMarker(name, value) {
        if (value === null) {
            if (!this.#markers.has(name)) {
                return;
            }
            this.#markers.delete(name);
            for (let node = this; node; node = node.parentNode) {
                --node.#subtreeMarkerCount;
            }
            for (let node = this; node; node = node.parentNode) {
                this.#domModelInternal.dispatchEventToListeners(Events.MarkersChanged, node);
            }
            return;
        }
        if (this.parentNode && !this.#markers.has(name)) {
            for (let node = this; node; node = node.parentNode) {
                ++node.#subtreeMarkerCount;
            }
        }
        this.#markers.set(name, value);
        for (let node = this; node; node = node.parentNode) {
            this.#domModelInternal.dispatchEventToListeners(Events.MarkersChanged, node);
        }
    }
    marker(name) {
        return this.#markers.get(name) || null;
    }
    getMarkerKeysForTest() {
        return [...this.#markers.keys()];
    }
    traverseMarkers(visitor) {
        function traverse(node) {
            if (!node.#subtreeMarkerCount) {
                return;
            }
            for (const marker of node.#markers.keys()) {
                visitor(node, marker);
            }
            if (!node.childrenInternal) {
                return;
            }
            for (const child of node.childrenInternal) {
                traverse(child);
            }
        }
        traverse(this);
    }
    resolveURL(url) {
        if (!url) {
            return url;
        }
        for (let frameOwnerCandidate = this; frameOwnerCandidate; frameOwnerCandidate = frameOwnerCandidate.parentNode) {
            if (frameOwnerCandidate instanceof DOMDocument && frameOwnerCandidate.baseURL) {
                return Common.ParsedURL.ParsedURL.completeURL(frameOwnerCandidate.baseURL, url);
            }
        }
        return null;
    }
    highlight(mode) {
        this.#domModelInternal.overlayModel().highlightInOverlay({ node: this, selectorList: undefined }, mode);
    }
    highlightForTwoSeconds() {
        this.#domModelInternal.overlayModel().highlightInOverlayForTwoSeconds({ node: this, selectorList: undefined });
    }
    async resolveToObject(objectGroup) {
        const { object } = await this.#agent.invoke_resolveNode({ nodeId: this.id, backendNodeId: undefined, objectGroup });
        return object && this.#domModelInternal.runtimeModelInternal.createRemoteObject(object) || null;
    }
    async boxModel() {
        const { model } = await this.#agent.invoke_getBoxModel({ nodeId: this.id });
        return model;
    }
    async setAsInspectedNode() {
        let node = this;
        if (node && node.pseudoType()) {
            node = node.parentNode;
        }
        while (node) {
            let ancestor = node.ancestorUserAgentShadowRoot();
            if (!ancestor) {
                break;
            }
            ancestor = node.ancestorShadowHost();
            if (!ancestor) {
                break;
            }
            // User #agent shadow root, keep climbing up.
            node = ancestor;
        }
        if (!node) {
            throw new Error('In DOMNode.setAsInspectedNode: node is expected to not be null.');
        }
        await this.#agent.invoke_setInspectedNode({ nodeId: node.id });
    }
    enclosingElementOrSelf() {
        let node = this;
        if (node && node.nodeType() === Node.TEXT_NODE && node.parentNode) {
            node = node.parentNode;
        }
        if (node && node.nodeType() !== Node.ELEMENT_NODE) {
            node = null;
        }
        return node;
    }
    async scrollIntoView() {
        const node = this.enclosingElementOrSelf();
        if (!node) {
            return;
        }
        const object = await node.resolveToObject();
        if (!object) {
            return;
        }
        // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
        // @ts-expect-error
        void object.callFunction(scrollIntoView);
        object.release();
        node.highlightForTwoSeconds();
        function scrollIntoView() {
            this.scrollIntoViewIfNeeded(true);
        }
    }
    async focus() {
        const node = this.enclosingElementOrSelf();
        if (!node) {
            throw new Error('DOMNode.focus expects node to not be null.');
        }
        const object = await node.resolveToObject();
        if (!object) {
            return;
        }
        // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
        // @ts-expect-error
        await object.callFunction(focusInPage);
        object.release();
        node.highlightForTwoSeconds();
        await this.#domModelInternal.target().pageAgent().invoke_bringToFront();
        function focusInPage() {
            this.focus();
        }
    }
    simpleSelector() {
        const lowerCaseName = this.localName() || this.nodeName().toLowerCase();
        if (this.nodeType() !== Node.ELEMENT_NODE) {
            return lowerCaseName;
        }
        const type = this.getAttribute('type');
        const id = this.getAttribute('id');
        const classes = this.getAttribute('class');
        if (lowerCaseName === 'input' && type && !id && !classes) {
            return lowerCaseName + '[type="' + CSS.escape(type) + '"]';
        }
        if (id) {
            return lowerCaseName + '#' + CSS.escape(id);
        }
        if (classes) {
            const classList = classes.trim().split(/\s+/g);
            return (lowerCaseName === 'div' ? '' : lowerCaseName) + '.' + classList.map(cls => CSS.escape(cls)).join('.');
        }
        return lowerCaseName;
    }
}
(function (DOMNode) {
    // TODO(crbug.com/1167717): Make this a const enum again
    // eslint-disable-next-line rulesdir/const_enum
    let PseudoElementNames;
    (function (PseudoElementNames) {
        PseudoElementNames["Before"] = "before";
        PseudoElementNames["After"] = "after";
        PseudoElementNames["Marker"] = "marker";
        PseudoElementNames["PageTransition"] = "page-transition";
        PseudoElementNames["PageTransitionContainer"] = "page-transition-container";
        PseudoElementNames["PageTransitionImageWrapper"] = "page-transition-image-wrapper";
        PseudoElementNames["PageTransitionOutgoingImage"] = "page-transition-outgoing-image";
        PseudoElementNames["PageTransitionIncomingImage"] = "page-transition-incoming-image";
    })(PseudoElementNames = DOMNode.PseudoElementNames || (DOMNode.PseudoElementNames = {}));
    // TODO(crbug.com/1167717): Make this a const enum again
    // eslint-disable-next-line rulesdir/const_enum
    let ShadowRootTypes;
    (function (ShadowRootTypes) {
        ShadowRootTypes["UserAgent"] = "user-agent";
        ShadowRootTypes["Open"] = "open";
        ShadowRootTypes["Closed"] = "closed";
    })(ShadowRootTypes = DOMNode.ShadowRootTypes || (DOMNode.ShadowRootTypes = {}));
})(DOMNode || (DOMNode = {}));
export class DeferredDOMNode {
    #domModelInternal;
    #backendNodeIdInternal;
    constructor(target, backendNodeId) {
        this.#domModelInternal = target.model(DOMModel);
        this.#backendNodeIdInternal = backendNodeId;
    }
    resolve(callback) {
        void this.resolvePromise().then(callback);
    }
    async resolvePromise() {
        const nodeIds = await this.#domModelInternal.pushNodesByBackendIdsToFrontend(new Set([this.#backendNodeIdInternal]));
        return nodeIds && nodeIds.get(this.#backendNodeIdInternal) || null;
    }
    backendNodeId() {
        return this.#backendNodeIdInternal;
    }
    domModel() {
        return this.#domModelInternal;
    }
    highlight() {
        this.#domModelInternal.overlayModel().highlightInOverlay({ deferredNode: this, selectorList: undefined });
    }
}
export class DOMNodeShortcut {
    nodeType;
    nodeName;
    deferredNode;
    constructor(target, backendNodeId, nodeType, nodeName) {
        this.nodeType = nodeType;
        this.nodeName = nodeName;
        this.deferredNode = new DeferredDOMNode(target, backendNodeId);
    }
}
export class DOMDocument extends DOMNode {
    body;
    documentElement;
    documentURL;
    baseURL;
    constructor(domModel, payload) {
        super(domModel);
        this.body = null;
        this.documentElement = null;
        this.init(this, false, payload);
        this.documentURL = (payload.documentURL || '');
        this.baseURL = (payload.baseURL || '');
    }
}
export class DOMModel extends SDKModel {
    agent;
    idToDOMNode = new Map();
    #document;
    #attributeLoadNodeIds;
    runtimeModelInternal;
    #lastMutationId;
    #pendingDocumentRequestPromise;
    #frameOwnerNode;
    #loadNodeAttributesTimeout;
    #searchId;
    constructor(target) {
        super(target);
        this.agent = target.domAgent();
        this.#document = null;
        this.#attributeLoadNodeIds = new Set();
        target.registerDOMDispatcher(new DOMDispatcher(this));
        this.runtimeModelInternal = target.model(RuntimeModel);
        this.#pendingDocumentRequestPromise = null;
        if (!target.suspended()) {
            void this.agent.invoke_enable({});
        }
        if (Root.Runtime.experiments.isEnabled('captureNodeCreationStacks')) {
            void this.agent.invoke_setNodeStackTracesEnabled({ enable: true });
        }
    }
    runtimeModel() {
        return this.runtimeModelInternal;
    }
    cssModel() {
        return this.target().model(CSSModel);
    }
    overlayModel() {
        return this.target().model(OverlayModel);
    }
    static cancelSearch() {
        for (const domModel of TargetManager.instance().models(DOMModel)) {
            domModel.cancelSearch();
        }
    }
    scheduleMutationEvent(node) {
        if (!this.hasEventListeners(Events.DOMMutated)) {
            return;
        }
        this.#lastMutationId = (this.#lastMutationId || 0) + 1;
        void Promise.resolve().then(callObserve.bind(this, node, this.#lastMutationId));
        function callObserve(node, mutationId) {
            if (!this.hasEventListeners(Events.DOMMutated) || this.#lastMutationId !== mutationId) {
                return;
            }
            this.dispatchEventToListeners(Events.DOMMutated, node);
        }
    }
    requestDocument() {
        if (this.#document) {
            return Promise.resolve(this.#document);
        }
        if (!this.#pendingDocumentRequestPromise) {
            this.#pendingDocumentRequestPromise = this.requestDocumentInternal();
        }
        return this.#pendingDocumentRequestPromise;
    }
    async getOwnerNodeForFrame(frameId) {
        // Returns an error if the frameId does not belong to the current target.
        const response = await this.agent.invoke_getFrameOwner({ frameId });
        if (response.getError()) {
            return null;
        }
        return new DeferredDOMNode(this.target(), response.backendNodeId);
    }
    async requestDocumentInternal() {
        const response = await this.agent.invoke_getDocument({});
        if (response.getError()) {
            console.error(response.getError());
            return null;
        }
        const { root: documentPayload } = response;
        this.#pendingDocumentRequestPromise = null;
        if (documentPayload) {
            this.setDocument(documentPayload);
        }
        if (!this.#document) {
            console.error('No document');
            return null;
        }
        const parentModel = this.parentModel();
        if (parentModel && !this.#frameOwnerNode) {
            await parentModel.requestDocument();
            const mainFrame = this.target().model(ResourceTreeModel)?.mainFrame;
            if (mainFrame) {
                const response = await parentModel.agent.invoke_getFrameOwner({ frameId: mainFrame.id });
                if (!response.getError() && response.nodeId) {
                    this.#frameOwnerNode = parentModel.nodeForId(response.nodeId);
                }
            }
        }
        // Document could have been cleared by now.
        if (this.#frameOwnerNode) {
            const oldDocument = this.#frameOwnerNode.contentDocument();
            this.#frameOwnerNode.setContentDocument(this.#document);
            this.#frameOwnerNode.setChildren([]);
            if (this.#document) {
                this.#document.parentNode = this.#frameOwnerNode;
                this.dispatchEventToListeners(Events.NodeInserted, this.#document);
            }
            else if (oldDocument) {
                this.dispatchEventToListeners(Events.NodeRemoved, { node: oldDocument, parent: this.#frameOwnerNode });
            }
        }
        return this.#document;
    }
    existingDocument() {
        return this.#document;
    }
    async pushNodeToFrontend(objectId) {
        await this.requestDocument();
        const { nodeId } = await this.agent.invoke_requestNode({ objectId });
        return nodeId ? this.nodeForId(nodeId) : null;
    }
    pushNodeByPathToFrontend(path) {
        return this.requestDocument()
            .then(() => this.agent.invoke_pushNodeByPathToFrontend({ path }))
            .then(({ nodeId }) => nodeId);
    }
    async pushNodesByBackendIdsToFrontend(backendNodeIds) {
        await this.requestDocument();
        const backendNodeIdsArray = [...backendNodeIds];
        const { nodeIds } = await this.agent.invoke_pushNodesByBackendIdsToFrontend({ backendNodeIds: backendNodeIdsArray });
        if (!nodeIds) {
            return null;
        }
        const map = new Map();
        for (let i = 0; i < nodeIds.length; ++i) {
            if (nodeIds[i]) {
                map.set(backendNodeIdsArray[i], this.nodeForId(nodeIds[i]));
            }
        }
        return map;
    }
    attributeModified(nodeId, name, value) {
        const node = this.idToDOMNode.get(nodeId);
        if (!node) {
            return;
        }
        node.setAttributeInternal(name, value);
        this.dispatchEventToListeners(Events.AttrModified, { node: node, name: name });
        this.scheduleMutationEvent(node);
    }
    attributeRemoved(nodeId, name) {
        const node = this.idToDOMNode.get(nodeId);
        if (!node) {
            return;
        }
        node.removeAttributeInternal(name);
        this.dispatchEventToListeners(Events.AttrRemoved, { node: node, name: name });
        this.scheduleMutationEvent(node);
    }
    inlineStyleInvalidated(nodeIds) {
        Platform.SetUtilities.addAll(this.#attributeLoadNodeIds, nodeIds);
        if (!this.#loadNodeAttributesTimeout) {
            this.#loadNodeAttributesTimeout = window.setTimeout(this.loadNodeAttributes.bind(this), 20);
        }
    }
    loadNodeAttributes() {
        this.#loadNodeAttributesTimeout = undefined;
        for (const nodeId of this.#attributeLoadNodeIds) {
            void this.agent.invoke_getAttributes({ nodeId }).then(({ attributes }) => {
                if (!attributes) {
                    // We are calling loadNodeAttributes asynchronously, it is ok if node is not found.
                    return;
                }
                const node = this.idToDOMNode.get(nodeId);
                if (!node) {
                    return;
                }
                if (node.setAttributesPayload(attributes)) {
                    this.dispatchEventToListeners(Events.AttrModified, { node: node, name: 'style' });
                    this.scheduleMutationEvent(node);
                }
            });
        }
        this.#attributeLoadNodeIds.clear();
    }
    characterDataModified(nodeId, newValue) {
        const node = this.idToDOMNode.get(nodeId);
        if (!node) {
            console.error('nodeId could not be resolved to a node');
            return;
        }
        node.setNodeValueInternal(newValue);
        this.dispatchEventToListeners(Events.CharacterDataModified, node);
        this.scheduleMutationEvent(node);
    }
    nodeForId(nodeId) {
        return nodeId ? this.idToDOMNode.get(nodeId) || null : null;
    }
    documentUpdated() {
        // If we have this.#pendingDocumentRequestPromise in flight,
        // it will contain most recent result.
        const documentWasRequested = this.#pendingDocumentRequestPromise;
        this.setDocument(null);
        if (this.parentModel() && !documentWasRequested) {
            void this.requestDocument();
        }
    }
    setDocument(payload) {
        this.idToDOMNode = new Map();
        if (payload && 'nodeId' in payload) {
            this.#document = new DOMDocument(this, payload);
        }
        else {
            this.#document = null;
        }
        DOMModelUndoStack.instance().dispose(this);
        if (!this.parentModel()) {
            this.dispatchEventToListeners(Events.DocumentUpdated, this);
        }
    }
    setDetachedRoot(payload) {
        if (payload.nodeName === '#document') {
            new DOMDocument(this, payload);
        }
        else {
            DOMNode.create(this, null, false, payload);
        }
    }
    setChildNodes(parentId, payloads) {
        if (!parentId && payloads.length) {
            this.setDetachedRoot(payloads[0]);
            return;
        }
        const parent = this.idToDOMNode.get(parentId);
        parent?.setChildrenPayload(payloads);
    }
    childNodeCountUpdated(nodeId, newValue) {
        const node = this.idToDOMNode.get(nodeId);
        if (!node) {
            console.error('nodeId could not be resolved to a node');
            return;
        }
        node.setChildNodeCount(newValue);
        this.dispatchEventToListeners(Events.ChildNodeCountUpdated, node);
        this.scheduleMutationEvent(node);
    }
    childNodeInserted(parentId, prevId, payload) {
        const parent = this.idToDOMNode.get(parentId);
        const prev = this.idToDOMNode.get(prevId);
        if (!parent) {
            console.error('parentId could not be resolved to a node');
            return;
        }
        const node = parent.insertChild(prev, payload);
        this.idToDOMNode.set(node.id, node);
        this.dispatchEventToListeners(Events.NodeInserted, node);
        this.scheduleMutationEvent(node);
    }
    childNodeRemoved(parentId, nodeId) {
        const parent = this.idToDOMNode.get(parentId);
        const node = this.idToDOMNode.get(nodeId);
        if (!parent || !node) {
            console.error('parentId or nodeId could not be resolved to a node');
            return;
        }
        parent.removeChild(node);
        this.unbind(node);
        this.dispatchEventToListeners(Events.NodeRemoved, { node: node, parent: parent });
        this.scheduleMutationEvent(node);
    }
    shadowRootPushed(hostId, root) {
        const host = this.idToDOMNode.get(hostId);
        if (!host) {
            return;
        }
        const node = DOMNode.create(this, host.ownerDocument, true, root);
        node.parentNode = host;
        this.idToDOMNode.set(node.id, node);
        host.shadowRootsInternal.unshift(node);
        this.dispatchEventToListeners(Events.NodeInserted, node);
        this.scheduleMutationEvent(node);
    }
    shadowRootPopped(hostId, rootId) {
        const host = this.idToDOMNode.get(hostId);
        if (!host) {
            return;
        }
        const root = this.idToDOMNode.get(rootId);
        if (!root) {
            return;
        }
        host.removeChild(root);
        this.unbind(root);
        this.dispatchEventToListeners(Events.NodeRemoved, { node: root, parent: host });
        this.scheduleMutationEvent(root);
    }
    pseudoElementAdded(parentId, pseudoElement) {
        const parent = this.idToDOMNode.get(parentId);
        if (!parent) {
            return;
        }
        const node = DOMNode.create(this, parent.ownerDocument, false, pseudoElement);
        node.parentNode = parent;
        this.idToDOMNode.set(node.id, node);
        const pseudoType = node.pseudoType();
        if (!pseudoType) {
            throw new Error('DOMModel._pseudoElementAdded expects pseudoType to be defined.');
        }
        const currentPseudoElements = parent.pseudoElements().get(pseudoType);
        if (currentPseudoElements) {
            Platform.DCHECK(() => pseudoType.startsWith('page-transition'), 'DOMModel.pseudoElementAdded expects parent to not already have this pseudo type added; only page-transition* pseudo elements can coexist under the same parent.');
            currentPseudoElements.push(node);
        }
        else {
            parent.pseudoElements().set(pseudoType, [node]);
        }
        this.dispatchEventToListeners(Events.NodeInserted, node);
        this.scheduleMutationEvent(node);
    }
    topLayerElementsUpdated() {
        this.dispatchEventToListeners(Events.TopLayerElementsChanged);
    }
    pseudoElementRemoved(parentId, pseudoElementId) {
        const parent = this.idToDOMNode.get(parentId);
        if (!parent) {
            return;
        }
        const pseudoElement = this.idToDOMNode.get(pseudoElementId);
        if (!pseudoElement) {
            return;
        }
        parent.removeChild(pseudoElement);
        this.unbind(pseudoElement);
        this.dispatchEventToListeners(Events.NodeRemoved, { node: pseudoElement, parent: parent });
        this.scheduleMutationEvent(pseudoElement);
    }
    distributedNodesUpdated(insertionPointId, distributedNodes) {
        const insertionPoint = this.idToDOMNode.get(insertionPointId);
        if (!insertionPoint) {
            return;
        }
        insertionPoint.setDistributedNodePayloads(distributedNodes);
        this.dispatchEventToListeners(Events.DistributedNodesChanged, insertionPoint);
        this.scheduleMutationEvent(insertionPoint);
    }
    unbind(node) {
        this.idToDOMNode.delete(node.id);
        const children = node.children();
        for (let i = 0; children && i < children.length; ++i) {
            this.unbind(children[i]);
        }
        for (let i = 0; i < node.shadowRootsInternal.length; ++i) {
            this.unbind(node.shadowRootsInternal[i]);
        }
        const pseudoElements = node.pseudoElements();
        for (const value of pseudoElements.values()) {
            for (const pseudoElement of value) {
                this.unbind(pseudoElement);
            }
        }
        const templateContent = node.templateContent();
        if (templateContent) {
            this.unbind(templateContent);
        }
    }
    async getNodesByStyle(computedStyles, pierce = false) {
        await this.requestDocument();
        if (!this.#document) {
            throw new Error('DOMModel.getNodesByStyle expects to have a document.');
        }
        const response = await this.agent.invoke_getNodesForSubtreeByStyle({ nodeId: this.#document.id, computedStyles, pierce });
        if (response.getError()) {
            throw response.getError();
        }
        return response.nodeIds;
    }
    async performSearch(query, includeUserAgentShadowDOM) {
        const response = await this.agent.invoke_performSearch({ query, includeUserAgentShadowDOM });
        if (!response.getError()) {
            this.#searchId = response.searchId;
        }
        return response.getError() ? 0 : response.resultCount;
    }
    async searchResult(index) {
        if (!this.#searchId) {
            return null;
        }
        const { nodeIds } = await this.agent.invoke_getSearchResults({ searchId: this.#searchId, fromIndex: index, toIndex: index + 1 });
        return nodeIds && nodeIds.length === 1 ? this.nodeForId(nodeIds[0]) : null;
    }
    cancelSearch() {
        if (!this.#searchId) {
            return;
        }
        void this.agent.invoke_discardSearchResults({ searchId: this.#searchId });
        this.#searchId = undefined;
    }
    classNamesPromise(nodeId) {
        return this.agent.invoke_collectClassNamesFromSubtree({ nodeId }).then(({ classNames }) => classNames || []);
    }
    querySelector(nodeId, selector) {
        return this.agent.invoke_querySelector({ nodeId, selector }).then(({ nodeId }) => nodeId);
    }
    querySelectorAll(nodeId, selector) {
        return this.agent.invoke_querySelectorAll({ nodeId, selector }).then(({ nodeIds }) => nodeIds);
    }
    getTopLayerElements() {
        return this.agent.invoke_getTopLayerElements().then(({ nodeIds }) => nodeIds);
    }
    markUndoableState(minorChange) {
        void DOMModelUndoStack.instance().markUndoableState(this, minorChange || false);
    }
    async nodeForLocation(x, y, includeUserAgentShadowDOM) {
        const response = await this.agent.invoke_getNodeForLocation({ x, y, includeUserAgentShadowDOM });
        if (response.getError() || !response.nodeId) {
            return null;
        }
        return this.nodeForId(response.nodeId);
    }
    async getContainerForNode(nodeId, containerName) {
        const { nodeId: containerNodeId } = await this.agent.invoke_getContainerForNode({ nodeId, containerName });
        if (!containerNodeId) {
            return null;
        }
        return this.nodeForId(containerNodeId);
    }
    pushObjectAsNodeToFrontend(object) {
        return object.isNode() && object.objectId ? this.pushNodeToFrontend(object.objectId) : Promise.resolve(null);
    }
    suspendModel() {
        return this.agent.invoke_disable().then(() => this.setDocument(null));
    }
    async resumeModel() {
        await this.agent.invoke_enable({});
    }
    dispose() {
        DOMModelUndoStack.instance().dispose(this);
    }
    parentModel() {
        const parentTarget = this.target().parentTarget();
        return parentTarget ? parentTarget.model(DOMModel) : null;
    }
    getAgent() {
        return this.agent;
    }
    registerNode(node) {
        this.idToDOMNode.set(node.id, node);
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["AttrModified"] = "AttrModified";
    Events["AttrRemoved"] = "AttrRemoved";
    Events["CharacterDataModified"] = "CharacterDataModified";
    Events["DOMMutated"] = "DOMMutated";
    Events["NodeInserted"] = "NodeInserted";
    Events["NodeRemoved"] = "NodeRemoved";
    Events["DocumentUpdated"] = "DocumentUpdated";
    Events["ChildNodeCountUpdated"] = "ChildNodeCountUpdated";
    Events["DistributedNodesChanged"] = "DistributedNodesChanged";
    Events["MarkersChanged"] = "MarkersChanged";
    Events["TopLayerElementsChanged"] = "TopLayerElementsChanged";
})(Events || (Events = {}));
class DOMDispatcher {
    #domModel;
    constructor(domModel) {
        this.#domModel = domModel;
    }
    documentUpdated() {
        this.#domModel.documentUpdated();
    }
    attributeModified({ nodeId, name, value }) {
        this.#domModel.attributeModified(nodeId, name, value);
    }
    attributeRemoved({ nodeId, name }) {
        this.#domModel.attributeRemoved(nodeId, name);
    }
    inlineStyleInvalidated({ nodeIds }) {
        this.#domModel.inlineStyleInvalidated(nodeIds);
    }
    characterDataModified({ nodeId, characterData }) {
        this.#domModel.characterDataModified(nodeId, characterData);
    }
    setChildNodes({ parentId, nodes }) {
        this.#domModel.setChildNodes(parentId, nodes);
    }
    childNodeCountUpdated({ nodeId, childNodeCount }) {
        this.#domModel.childNodeCountUpdated(nodeId, childNodeCount);
    }
    childNodeInserted({ parentNodeId, previousNodeId, node }) {
        this.#domModel.childNodeInserted(parentNodeId, previousNodeId, node);
    }
    childNodeRemoved({ parentNodeId, nodeId }) {
        this.#domModel.childNodeRemoved(parentNodeId, nodeId);
    }
    shadowRootPushed({ hostId, root }) {
        this.#domModel.shadowRootPushed(hostId, root);
    }
    shadowRootPopped({ hostId, rootId }) {
        this.#domModel.shadowRootPopped(hostId, rootId);
    }
    pseudoElementAdded({ parentId, pseudoElement }) {
        this.#domModel.pseudoElementAdded(parentId, pseudoElement);
    }
    pseudoElementRemoved({ parentId, pseudoElementId }) {
        this.#domModel.pseudoElementRemoved(parentId, pseudoElementId);
    }
    distributedNodesUpdated({ insertionPointId, distributedNodes }) {
        this.#domModel.distributedNodesUpdated(insertionPointId, distributedNodes);
    }
    topLayerElementsUpdated() {
        this.#domModel.topLayerElementsUpdated();
    }
}
// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
// eslint-disable-next-line @typescript-eslint/naming-convention
let DOMModelUndoStackInstance;
export class DOMModelUndoStack {
    #stack;
    #index;
    #lastModelWithMinorChange;
    constructor() {
        this.#stack = [];
        this.#index = 0;
        this.#lastModelWithMinorChange = null;
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!DOMModelUndoStackInstance || forceNew) {
            DOMModelUndoStackInstance = new DOMModelUndoStack();
        }
        return DOMModelUndoStackInstance;
    }
    async markUndoableState(model, minorChange) {
        // Both minor and major changes get into the #stack, but minor updates are coalesced.
        // Commit major undoable state in the old model upon model switch.
        if (this.#lastModelWithMinorChange && model !== this.#lastModelWithMinorChange) {
            this.#lastModelWithMinorChange.markUndoableState();
            this.#lastModelWithMinorChange = null;
        }
        // Previous minor change is already in the #stack.
        if (minorChange && this.#lastModelWithMinorChange === model) {
            return;
        }
        this.#stack = this.#stack.slice(0, this.#index);
        this.#stack.push(model);
        this.#index = this.#stack.length;
        // Delay marking as major undoable states in case of minor operations until the
        // major or model switch.
        if (minorChange) {
            this.#lastModelWithMinorChange = model;
        }
        else {
            await model.getAgent().invoke_markUndoableState();
            this.#lastModelWithMinorChange = null;
        }
    }
    async undo() {
        if (this.#index === 0) {
            return Promise.resolve();
        }
        --this.#index;
        this.#lastModelWithMinorChange = null;
        await this.#stack[this.#index].getAgent().invoke_undo();
    }
    async redo() {
        if (this.#index >= this.#stack.length) {
            return Promise.resolve();
        }
        ++this.#index;
        this.#lastModelWithMinorChange = null;
        await this.#stack[this.#index - 1].getAgent().invoke_redo();
    }
    dispose(model) {
        let shift = 0;
        for (let i = 0; i < this.#index; ++i) {
            if (this.#stack[i] === model) {
                ++shift;
            }
        }
        Platform.ArrayUtilities.removeElement(this.#stack, model);
        this.#index -= shift;
        if (this.#lastModelWithMinorChange === model) {
            this.#lastModelWithMinorChange = null;
        }
    }
}
SDKModel.register(DOMModel, { capabilities: Capability.DOM, autostart: true });
//# sourceMappingURL=DOMModel.js.map