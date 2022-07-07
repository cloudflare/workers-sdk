// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { TimelineJSProfileProcessor } from './TimelineJSProfile.js';
import { RecordType, TimelineData, TimelineModelImpl } from './TimelineModel.js';
export class Node {
    totalTime;
    selfTime;
    id;
    event;
    parent;
    groupId;
    isGroupNodeInternal;
    depth;
    constructor(id, event) {
        this.totalTime = 0;
        this.selfTime = 0;
        this.id = id;
        this.event = event;
        this.groupId = '';
        this.isGroupNodeInternal = false;
        this.depth = 0;
    }
    isGroupNode() {
        return this.isGroupNodeInternal;
    }
    hasChildren() {
        throw 'Not implemented';
    }
    setHasChildren(_value) {
        throw 'Not implemented';
    }
    children() {
        throw 'Not implemented';
    }
    searchTree(matchFunction, results) {
        results = results || [];
        if (this.event && matchFunction(this.event)) {
            results.push(this);
        }
        for (const child of this.children().values()) {
            child.searchTree(matchFunction, results);
        }
        return results;
    }
}
export class TopDownNode extends Node {
    root;
    hasChildrenInternal;
    childrenInternal;
    parent;
    constructor(id, event, parent) {
        super(id, event);
        this.root = parent && parent.root;
        this.hasChildrenInternal = false;
        this.childrenInternal = null;
        this.parent = parent;
    }
    hasChildren() {
        return this.hasChildrenInternal;
    }
    setHasChildren(value) {
        this.hasChildrenInternal = value;
    }
    children() {
        return this.childrenInternal || this.buildChildren();
    }
    buildChildren() {
        const path = [];
        for (let node = this; node.parent && !node.isGroupNode(); node = node.parent) {
            path.push(node);
        }
        path.reverse();
        const children = new Map();
        const self = this;
        const root = this.root;
        if (!root) {
            this.childrenInternal = children;
            return this.childrenInternal;
        }
        const startTime = root.startTime;
        const endTime = root.endTime;
        const instantEventCallback = root.doNotAggregate ? onInstantEvent : undefined;
        const eventIdCallback = root.doNotAggregate ? undefined : _eventId;
        const eventGroupIdCallback = root.getEventGroupIdCallback();
        let depth = 0;
        let matchedDepth = 0;
        let currentDirectChild = null;
        TimelineModelImpl.forEachEvent(root.events, onStartEvent, onEndEvent, instantEventCallback, startTime, endTime, root.filter);
        function onStartEvent(e) {
            ++depth;
            if (depth > path.length + 2) {
                return;
            }
            if (!matchPath(e)) {
                return;
            }
            const actualEndTime = e.endTime !== undefined ? Math.min(e.endTime, endTime) : endTime;
            const duration = actualEndTime - Math.max(startTime, e.startTime);
            if (duration < 0) {
                console.error('Negative event duration');
            }
            processEvent(e, duration);
        }
        function onInstantEvent(e) {
            ++depth;
            if (matchedDepth === path.length && depth <= path.length + 2) {
                processEvent(e, 0);
            }
            --depth;
        }
        function processEvent(e, duration) {
            if (depth === path.length + 2) {
                if (!currentDirectChild) {
                    return;
                }
                currentDirectChild.setHasChildren(true);
                currentDirectChild.selfTime -= duration;
                return;
            }
            let id;
            let groupId = '';
            if (!eventIdCallback) {
                id = Symbol('uniqueId');
            }
            else {
                id = eventIdCallback(e);
                groupId = eventGroupIdCallback ? eventGroupIdCallback(e) : '';
                if (groupId) {
                    id += '/' + groupId;
                }
            }
            let node = children.get(id);
            if (!node) {
                node = new TopDownNode(id, e, self);
                node.groupId = groupId;
                children.set(id, node);
            }
            node.selfTime += duration;
            node.totalTime += duration;
            currentDirectChild = node;
        }
        function matchPath(e) {
            if (matchedDepth === path.length) {
                return true;
            }
            if (matchedDepth !== depth - 1) {
                return false;
            }
            if (!e.endTime) {
                return false;
            }
            if (!eventIdCallback) {
                if (e === path[matchedDepth].event) {
                    ++matchedDepth;
                }
                return false;
            }
            let id = eventIdCallback(e);
            const groupId = eventGroupIdCallback ? eventGroupIdCallback(e) : '';
            if (groupId) {
                id += '/' + groupId;
            }
            if (id === path[matchedDepth].id) {
                ++matchedDepth;
            }
            return false;
        }
        function onEndEvent(_e) {
            --depth;
            if (matchedDepth > depth) {
                matchedDepth = depth;
            }
        }
        this.childrenInternal = children;
        return children;
    }
    getRoot() {
        return this.root;
    }
}
export class TopDownRootNode extends TopDownNode {
    events;
    filter;
    startTime;
    endTime;
    eventGroupIdCallback;
    doNotAggregate;
    totalTime;
    selfTime;
    constructor(events, filters, startTime, endTime, doNotAggregate, eventGroupIdCallback) {
        super('', null, null);
        this.root = this;
        this.events = events;
        this.filter = (e) => filters.every(f => f.accept(e));
        this.startTime = startTime;
        this.endTime = endTime;
        this.eventGroupIdCallback = eventGroupIdCallback;
        this.doNotAggregate = doNotAggregate;
        this.totalTime = endTime - startTime;
        this.selfTime = this.totalTime;
    }
    children() {
        return this.childrenInternal || this.grouppedTopNodes();
    }
    grouppedTopNodes() {
        const flatNodes = super.children();
        for (const node of flatNodes.values()) {
            this.selfTime -= node.totalTime;
        }
        if (!this.eventGroupIdCallback) {
            return flatNodes;
        }
        const groupNodes = new Map();
        for (const node of flatNodes.values()) {
            const groupId = this.eventGroupIdCallback(node.event);
            let groupNode = groupNodes.get(groupId);
            if (!groupNode) {
                groupNode = new GroupNode(groupId, this, node.event);
                groupNodes.set(groupId, groupNode);
            }
            groupNode.addChild(node, node.selfTime, node.totalTime);
        }
        this.childrenInternal = groupNodes;
        return groupNodes;
    }
    getEventGroupIdCallback() {
        return this.eventGroupIdCallback;
    }
}
export class BottomUpRootNode extends Node {
    childrenInternal;
    events;
    textFilter;
    filter;
    startTime;
    endTime;
    eventGroupIdCallback;
    totalTime;
    constructor(events, textFilter, filters, startTime, endTime, eventGroupIdCallback) {
        super('', null);
        this.childrenInternal = null;
        this.events = events;
        this.textFilter = textFilter;
        this.filter = (e) => filters.every(f => f.accept(e));
        this.startTime = startTime;
        this.endTime = endTime;
        this.eventGroupIdCallback = eventGroupIdCallback;
        this.totalTime = endTime - startTime;
    }
    hasChildren() {
        return true;
    }
    filterChildren(children) {
        for (const [id, child] of children) {
            if (child.event && !this.textFilter.accept(child.event)) {
                children.delete(id);
            }
        }
        return children;
    }
    children() {
        if (!this.childrenInternal) {
            this.childrenInternal = this.filterChildren(this.grouppedTopNodes());
        }
        return this.childrenInternal;
    }
    ungrouppedTopNodes() {
        const root = this;
        const startTime = this.startTime;
        const endTime = this.endTime;
        const nodeById = new Map();
        const selfTimeStack = [endTime - startTime];
        const firstNodeStack = [];
        const totalTimeById = new Map();
        TimelineModelImpl.forEachEvent(this.events, onStartEvent, onEndEvent, undefined, startTime, endTime, this.filter);
        function onStartEvent(e) {
            const actualEndTime = e.endTime !== undefined ? Math.min(e.endTime, endTime) : endTime;
            const duration = actualEndTime - Math.max(e.startTime, startTime);
            selfTimeStack[selfTimeStack.length - 1] -= duration;
            selfTimeStack.push(duration);
            const id = _eventId(e);
            const noNodeOnStack = !totalTimeById.has(id);
            if (noNodeOnStack) {
                totalTimeById.set(id, duration);
            }
            firstNodeStack.push(noNodeOnStack);
        }
        function onEndEvent(e) {
            const id = _eventId(e);
            let node = nodeById.get(id);
            if (!node) {
                node = new BottomUpNode(root, id, e, false, root);
                nodeById.set(id, node);
            }
            node.selfTime += selfTimeStack.pop() || 0;
            if (firstNodeStack.pop()) {
                node.totalTime += totalTimeById.get(id) || 0;
                totalTimeById.delete(id);
            }
            if (firstNodeStack.length) {
                node.setHasChildren(true);
            }
        }
        this.selfTime = selfTimeStack.pop() || 0;
        for (const pair of nodeById) {
            if (pair[1].selfTime <= 0) {
                nodeById.delete(pair[0]);
            }
        }
        return nodeById;
    }
    grouppedTopNodes() {
        const flatNodes = this.ungrouppedTopNodes();
        if (!this.eventGroupIdCallback) {
            return flatNodes;
        }
        const groupNodes = new Map();
        for (const node of flatNodes.values()) {
            const groupId = this.eventGroupIdCallback(node.event);
            let groupNode = groupNodes.get(groupId);
            if (!groupNode) {
                groupNode = new GroupNode(groupId, this, node.event);
                groupNodes.set(groupId, groupNode);
            }
            groupNode.addChild(node, node.selfTime, node.selfTime);
        }
        return groupNodes;
    }
}
export class GroupNode extends Node {
    childrenInternal;
    isGroupNodeInternal;
    constructor(id, parent, event) {
        super(id, event);
        this.childrenInternal = new Map();
        this.parent = parent;
        this.isGroupNodeInternal = true;
    }
    addChild(child, selfTime, totalTime) {
        this.childrenInternal.set(child.id, child);
        this.selfTime += selfTime;
        this.totalTime += totalTime;
        child.parent = this;
    }
    hasChildren() {
        return true;
    }
    children() {
        return this.childrenInternal;
    }
}
export class BottomUpNode extends Node {
    parent;
    root;
    depth;
    cachedChildren;
    hasChildrenInternal;
    constructor(root, id, event, hasChildren, parent) {
        super(id, event);
        this.parent = parent;
        this.root = root;
        this.depth = (parent.depth || 0) + 1;
        this.cachedChildren = null;
        this.hasChildrenInternal = hasChildren;
    }
    hasChildren() {
        return this.hasChildrenInternal;
    }
    setHasChildren(value) {
        this.hasChildrenInternal = value;
    }
    children() {
        if (this.cachedChildren) {
            return this.cachedChildren;
        }
        const selfTimeStack = [0];
        const eventIdStack = [];
        const eventStack = [];
        const nodeById = new Map();
        const startTime = this.root.startTime;
        const endTime = this.root.endTime;
        let lastTimeMarker = startTime;
        const self = this;
        TimelineModelImpl.forEachEvent(this.root.events, onStartEvent, onEndEvent, undefined, startTime, endTime, this.root.filter);
        function onStartEvent(e) {
            const actualEndTime = e.endTime !== undefined ? Math.min(e.endTime, endTime) : endTime;
            const duration = actualEndTime - Math.max(e.startTime, startTime);
            if (duration < 0) {
                console.assert(false, 'Negative duration of an event');
            }
            selfTimeStack[selfTimeStack.length - 1] -= duration;
            selfTimeStack.push(duration);
            const id = _eventId(e);
            eventIdStack.push(id);
            eventStack.push(e);
        }
        function onEndEvent(e) {
            const selfTime = selfTimeStack.pop();
            const id = eventIdStack.pop();
            eventStack.pop();
            let node;
            for (node = self; node.depth > 1; node = node.parent) {
                if (node.id !== eventIdStack[eventIdStack.length + 1 - node.depth]) {
                    return;
                }
            }
            if (node.id !== id || eventIdStack.length < self.depth) {
                return;
            }
            const childId = eventIdStack[eventIdStack.length - self.depth];
            node = nodeById.get(childId);
            if (!node) {
                const event = eventStack[eventStack.length - self.depth];
                const hasChildren = eventStack.length > self.depth;
                node = new BottomUpNode(self.root, childId, event, hasChildren, self);
                nodeById.set(childId, node);
            }
            const actualEndTime = e.endTime !== undefined ? Math.min(e.endTime, endTime) : endTime;
            const totalTime = actualEndTime - Math.max(e.startTime, lastTimeMarker);
            node.selfTime += selfTime || 0;
            node.totalTime += totalTime;
            lastTimeMarker = actualEndTime;
        }
        this.cachedChildren = this.root.filterChildren(nodeById);
        return this.cachedChildren;
    }
    searchTree(matchFunction, results) {
        results = results || [];
        if (this.event && matchFunction(this.event)) {
            results.push(this);
        }
        return results;
    }
}
export function eventURL(event) {
    const data = event.args['data'] || event.args['beginData'];
    if (data && data['url']) {
        return data['url'];
    }
    let frame = eventStackFrame(event);
    while (frame) {
        const url = frame['url'];
        if (url) {
            return url;
        }
        // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        frame = (frame.parent);
    }
    return null;
}
export function eventStackFrame(event) {
    if (event.name === RecordType.JSFrame) {
        return event.args['data'] || null;
    }
    return TimelineData.forEvent(event).topFrame();
}
// eslint-disable-next-line @typescript-eslint/naming-convention
export function _eventId(event) {
    if (event.name === RecordType.TimeStamp) {
        return `${event.name}:${event.args.data.message}`;
    }
    if (event.name !== RecordType.JSFrame) {
        return event.name;
    }
    const frame = event.args['data'];
    const location = frame['scriptId'] || frame['url'] || '';
    const functionName = frame['functionName'];
    const name = TimelineJSProfileProcessor.isNativeRuntimeFrame(frame) ?
        TimelineJSProfileProcessor.nativeGroup(functionName) || functionName :
        `${functionName}:${frame['lineNumber']}:${frame['columnNumber']}`;
    return `f:${name}@${location}`;
}
//# sourceMappingURL=TimelineProfileTree.js.map