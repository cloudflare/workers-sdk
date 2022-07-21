// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as Platform from '../platform/platform.js';
import { Type as TargetType } from './Target.js';
import { Target } from './Target.js';
import * as Root from '../root/root.js';
import * as Host from '../host/host.js';
let targetManagerInstance;
export class TargetManager extends Common.ObjectWrapper.ObjectWrapper {
    #targetsInternal;
    #observers;
    #modelListeners;
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    #modelObservers;
    #isSuspended;
    #browserTargetInternal;
    constructor() {
        super();
        this.#targetsInternal = new Set();
        this.#observers = new Set();
        this.#modelListeners = new Platform.MapUtilities.Multimap();
        this.#modelObservers = new Platform.MapUtilities.Multimap();
        this.#isSuspended = false;
        this.#browserTargetInternal = null;
    }
    static instance({ forceNew } = { forceNew: false }) {
        if (!targetManagerInstance || forceNew) {
            targetManagerInstance = new TargetManager();
        }
        return targetManagerInstance;
    }
    static removeInstance() {
        targetManagerInstance = undefined;
    }
    onInspectedURLChange(target) {
        this.dispatchEventToListeners(Events.InspectedURLChanged, target);
    }
    onNameChange(target) {
        this.dispatchEventToListeners(Events.NameChanged, target);
    }
    async suspendAllTargets(reason) {
        if (this.#isSuspended) {
            return;
        }
        this.#isSuspended = true;
        this.dispatchEventToListeners(Events.SuspendStateChanged);
        const suspendPromises = Array.from(this.#targetsInternal.values(), target => target.suspend(reason));
        await Promise.all(suspendPromises);
    }
    async resumeAllTargets() {
        if (!this.#isSuspended) {
            return;
        }
        this.#isSuspended = false;
        this.dispatchEventToListeners(Events.SuspendStateChanged);
        const resumePromises = Array.from(this.#targetsInternal.values(), target => target.resume());
        await Promise.all(resumePromises);
    }
    allTargetsSuspended() {
        return this.#isSuspended;
    }
    models(modelClass) {
        const result = [];
        for (const target of this.#targetsInternal) {
            const model = target.model(modelClass);
            if (model) {
                result.push(model);
            }
        }
        return result;
    }
    inspectedURL() {
        const mainTarget = this.mainTarget();
        return mainTarget ? mainTarget.inspectedURL() : '';
    }
    observeModels(modelClass, observer) {
        const models = this.models(modelClass);
        this.#modelObservers.set(modelClass, observer);
        for (const model of models) {
            observer.modelAdded(model);
        }
    }
    unobserveModels(modelClass, observer) {
        this.#modelObservers.delete(modelClass, observer);
    }
    modelAdded(target, modelClass, model) {
        for (const observer of this.#modelObservers.get(modelClass).values()) {
            observer.modelAdded(model);
        }
    }
    modelRemoved(target, modelClass, model) {
        for (const observer of this.#modelObservers.get(modelClass).values()) {
            observer.modelRemoved(model);
        }
    }
    addModelListener(modelClass, eventType, listener, thisObject) {
        for (const model of this.models(modelClass)) {
            model.addEventListener(eventType, listener, thisObject);
        }
        this.#modelListeners.set(eventType, { modelClass: modelClass, thisObject: thisObject, listener: listener });
    }
    removeModelListener(modelClass, eventType, listener, thisObject) {
        if (!this.#modelListeners.has(eventType)) {
            return;
        }
        for (const model of this.models(modelClass)) {
            model.removeEventListener(eventType, listener, thisObject);
        }
        for (const info of this.#modelListeners.get(eventType)) {
            if (info.modelClass === modelClass && info.listener === listener && info.thisObject === thisObject) {
                this.#modelListeners.delete(eventType, info);
            }
        }
    }
    observeTargets(targetObserver) {
        if (this.#observers.has(targetObserver)) {
            throw new Error('Observer can only be registered once');
        }
        for (const target of this.#targetsInternal) {
            targetObserver.targetAdded(target);
        }
        this.#observers.add(targetObserver);
    }
    unobserveTargets(targetObserver) {
        this.#observers.delete(targetObserver);
    }
    createTarget(id, name, type, parentTarget, sessionId, waitForDebuggerInPage, connection, targetInfo) {
        const target = new Target(this, id, name, type, parentTarget, sessionId || '', this.#isSuspended, connection || null, targetInfo);
        if (waitForDebuggerInPage) {
            void target.pageAgent().invoke_waitForDebugger();
        }
        target.createModels(new Set(this.#modelObservers.keysArray()));
        this.#targetsInternal.add(target);
        // Iterate over a copy. #observers might be modified during iteration.
        for (const observer of [...this.#observers]) {
            observer.targetAdded(target);
        }
        for (const [modelClass, model] of target.models().entries()) {
            this.modelAdded(target, modelClass, model);
        }
        for (const key of this.#modelListeners.keysArray()) {
            for (const info of this.#modelListeners.get(key)) {
                const model = target.model(info.modelClass);
                if (model) {
                    model.addEventListener(key, info.listener, info.thisObject);
                }
            }
        }
        return target;
    }
    removeTarget(target) {
        if (!this.#targetsInternal.has(target)) {
            return;
        }
        this.#targetsInternal.delete(target);
        for (const modelClass of target.models().keys()) {
            const model = target.models().get(modelClass);
            this.modelRemoved(target, modelClass, model);
        }
        // Iterate over a copy. #observers might be modified during iteration.
        for (const observer of [...this.#observers]) {
            observer.targetRemoved(target);
        }
        for (const key of this.#modelListeners.keysArray()) {
            for (const info of this.#modelListeners.get(key)) {
                const model = target.model(info.modelClass);
                if (model) {
                    model.removeEventListener(key, info.listener, info.thisObject);
                }
            }
        }
    }
    targets() {
        return [...this.#targetsInternal];
    }
    targetById(id) {
        // TODO(dgozman): add a map #id -> #target.
        return this.targets().find(target => target.id() === id) || null;
    }
    mainTarget() {
        return this.#targetsInternal.size ? this.#targetsInternal.values().next().value : null;
    }
    browserTarget() {
        return this.#browserTargetInternal;
    }
    async maybeAttachInitialTarget() {
        if (!Boolean(Root.Runtime.Runtime.queryParam('browserConnection'))) {
            return false;
        }
        if (!this.#browserTargetInternal) {
            this.#browserTargetInternal = new Target(this, /* #id*/ 'main', /* #name*/ 'browser', TargetType.Browser, /* #parentTarget*/ null, 
            /* #sessionId */ '', /* suspended*/ false, /* #connection*/ null, /* targetInfo*/ undefined);
            this.#browserTargetInternal.createModels(new Set(this.#modelObservers.keysArray()));
        }
        const targetId = await Host.InspectorFrontendHost.InspectorFrontendHostInstance.initialTargetId();
        // Do not await for Target.autoAttachRelated to return, as it goes throguh the renderer and we don't want to block early
        // at front-end initialization if a renderer is stuck. The rest of #target discovery and auto-attach process should happen
        // asynchronously upon Target.attachedToTarget.
        void this.#browserTargetInternal.targetAgent().invoke_autoAttachRelated({
            targetId,
            waitForDebuggerOnStart: true,
        });
        return true;
    }
    clearAllTargetsForTest() {
        this.#targetsInternal.clear();
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["AvailableTargetsChanged"] = "AvailableTargetsChanged";
    Events["InspectedURLChanged"] = "InspectedURLChanged";
    Events["NameChanged"] = "NameChanged";
    Events["SuspendStateChanged"] = "SuspendStateChanged";
})(Events || (Events = {}));
export class Observer {
    targetAdded(_target) {
    }
    targetRemoved(_target) {
    }
}
export class SDKModelObserver {
    modelAdded(_model) {
    }
    modelRemoved(_model) {
    }
}
//# sourceMappingURL=TargetManager.js.map