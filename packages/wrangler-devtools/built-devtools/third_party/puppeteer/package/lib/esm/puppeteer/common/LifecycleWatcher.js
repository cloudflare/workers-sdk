/**
 * Copyright 2019 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _LifecycleWatcher_instances, _LifecycleWatcher_expectedLifecycle, _LifecycleWatcher_frameManager, _LifecycleWatcher_frame, _LifecycleWatcher_timeout, _LifecycleWatcher_navigationRequest, _LifecycleWatcher_eventListeners, _LifecycleWatcher_sameDocumentNavigationCompleteCallback, _LifecycleWatcher_sameDocumentNavigationPromise, _LifecycleWatcher_lifecycleCallback, _LifecycleWatcher_lifecyclePromise, _LifecycleWatcher_newDocumentNavigationCompleteCallback, _LifecycleWatcher_newDocumentNavigationPromise, _LifecycleWatcher_terminationCallback, _LifecycleWatcher_terminationPromise, _LifecycleWatcher_timeoutPromise, _LifecycleWatcher_maximumTimer, _LifecycleWatcher_hasSameDocumentNavigation, _LifecycleWatcher_newDocumentNavigation, _LifecycleWatcher_swapped, _LifecycleWatcher_onRequest, _LifecycleWatcher_onFrameDetached, _LifecycleWatcher_terminate, _LifecycleWatcher_createTimeoutPromise, _LifecycleWatcher_navigatedWithinDocument, _LifecycleWatcher_navigated, _LifecycleWatcher_frameSwapped, _LifecycleWatcher_checkLifecycleComplete;
import { assert } from './assert.js';
import { addEventListener, removeEventListeners, } from './util.js';
import { TimeoutError } from './Errors.js';
import { FrameManagerEmittedEvents, } from './FrameManager.js';
import { NetworkManagerEmittedEvents } from './NetworkManager.js';
import { CDPSessionEmittedEvents } from './Connection.js';
const puppeteerToProtocolLifecycle = new Map([
    ['load', 'load'],
    ['domcontentloaded', 'DOMContentLoaded'],
    ['networkidle0', 'networkIdle'],
    ['networkidle2', 'networkAlmostIdle'],
]);
const noop = () => { };
/**
 * @internal
 */
export class LifecycleWatcher {
    constructor(frameManager, frame, waitUntil, timeout) {
        _LifecycleWatcher_instances.add(this);
        _LifecycleWatcher_expectedLifecycle.set(this, void 0);
        _LifecycleWatcher_frameManager.set(this, void 0);
        _LifecycleWatcher_frame.set(this, void 0);
        _LifecycleWatcher_timeout.set(this, void 0);
        _LifecycleWatcher_navigationRequest.set(this, null);
        _LifecycleWatcher_eventListeners.set(this, void 0);
        _LifecycleWatcher_sameDocumentNavigationCompleteCallback.set(this, noop);
        _LifecycleWatcher_sameDocumentNavigationPromise.set(this, new Promise(fulfill => {
            __classPrivateFieldSet(this, _LifecycleWatcher_sameDocumentNavigationCompleteCallback, fulfill, "f");
        }));
        _LifecycleWatcher_lifecycleCallback.set(this, noop);
        _LifecycleWatcher_lifecyclePromise.set(this, new Promise(fulfill => {
            __classPrivateFieldSet(this, _LifecycleWatcher_lifecycleCallback, fulfill, "f");
        }));
        _LifecycleWatcher_newDocumentNavigationCompleteCallback.set(this, noop);
        _LifecycleWatcher_newDocumentNavigationPromise.set(this, new Promise(fulfill => {
            __classPrivateFieldSet(this, _LifecycleWatcher_newDocumentNavigationCompleteCallback, fulfill, "f");
        }));
        _LifecycleWatcher_terminationCallback.set(this, noop);
        _LifecycleWatcher_terminationPromise.set(this, new Promise(fulfill => {
            __classPrivateFieldSet(this, _LifecycleWatcher_terminationCallback, fulfill, "f");
        }));
        _LifecycleWatcher_timeoutPromise.set(this, void 0);
        _LifecycleWatcher_maximumTimer.set(this, void 0);
        _LifecycleWatcher_hasSameDocumentNavigation.set(this, void 0);
        _LifecycleWatcher_newDocumentNavigation.set(this, void 0);
        _LifecycleWatcher_swapped.set(this, void 0);
        if (Array.isArray(waitUntil)) {
            waitUntil = waitUntil.slice();
        }
        else if (typeof waitUntil === 'string') {
            waitUntil = [waitUntil];
        }
        __classPrivateFieldSet(this, _LifecycleWatcher_expectedLifecycle, waitUntil.map(value => {
            const protocolEvent = puppeteerToProtocolLifecycle.get(value);
            assert(protocolEvent, 'Unknown value for options.waitUntil: ' + value);
            return protocolEvent;
        }), "f");
        __classPrivateFieldSet(this, _LifecycleWatcher_frameManager, frameManager, "f");
        __classPrivateFieldSet(this, _LifecycleWatcher_frame, frame, "f");
        __classPrivateFieldSet(this, _LifecycleWatcher_timeout, timeout, "f");
        __classPrivateFieldSet(this, _LifecycleWatcher_eventListeners, [
            addEventListener(frameManager._client, CDPSessionEmittedEvents.Disconnected, __classPrivateFieldGet(this, _LifecycleWatcher_instances, "m", _LifecycleWatcher_terminate).bind(this, new Error('Navigation failed because browser has disconnected!'))),
            addEventListener(__classPrivateFieldGet(this, _LifecycleWatcher_frameManager, "f"), FrameManagerEmittedEvents.LifecycleEvent, __classPrivateFieldGet(this, _LifecycleWatcher_instances, "m", _LifecycleWatcher_checkLifecycleComplete).bind(this)),
            addEventListener(__classPrivateFieldGet(this, _LifecycleWatcher_frameManager, "f"), FrameManagerEmittedEvents.FrameNavigatedWithinDocument, __classPrivateFieldGet(this, _LifecycleWatcher_instances, "m", _LifecycleWatcher_navigatedWithinDocument).bind(this)),
            addEventListener(__classPrivateFieldGet(this, _LifecycleWatcher_frameManager, "f"), FrameManagerEmittedEvents.FrameNavigated, __classPrivateFieldGet(this, _LifecycleWatcher_instances, "m", _LifecycleWatcher_navigated).bind(this)),
            addEventListener(__classPrivateFieldGet(this, _LifecycleWatcher_frameManager, "f"), FrameManagerEmittedEvents.FrameSwapped, __classPrivateFieldGet(this, _LifecycleWatcher_instances, "m", _LifecycleWatcher_frameSwapped).bind(this)),
            addEventListener(__classPrivateFieldGet(this, _LifecycleWatcher_frameManager, "f"), FrameManagerEmittedEvents.FrameDetached, __classPrivateFieldGet(this, _LifecycleWatcher_instances, "m", _LifecycleWatcher_onFrameDetached).bind(this)),
            addEventListener(__classPrivateFieldGet(this, _LifecycleWatcher_frameManager, "f").networkManager(), NetworkManagerEmittedEvents.Request, __classPrivateFieldGet(this, _LifecycleWatcher_instances, "m", _LifecycleWatcher_onRequest).bind(this)),
        ], "f");
        __classPrivateFieldSet(this, _LifecycleWatcher_timeoutPromise, __classPrivateFieldGet(this, _LifecycleWatcher_instances, "m", _LifecycleWatcher_createTimeoutPromise).call(this), "f");
        __classPrivateFieldGet(this, _LifecycleWatcher_instances, "m", _LifecycleWatcher_checkLifecycleComplete).call(this);
    }
    async navigationResponse() {
        // We may need to wait for ExtraInfo events before the request is complete.
        return __classPrivateFieldGet(this, _LifecycleWatcher_navigationRequest, "f") ? __classPrivateFieldGet(this, _LifecycleWatcher_navigationRequest, "f").response() : null;
    }
    sameDocumentNavigationPromise() {
        return __classPrivateFieldGet(this, _LifecycleWatcher_sameDocumentNavigationPromise, "f");
    }
    newDocumentNavigationPromise() {
        return __classPrivateFieldGet(this, _LifecycleWatcher_newDocumentNavigationPromise, "f");
    }
    lifecyclePromise() {
        return __classPrivateFieldGet(this, _LifecycleWatcher_lifecyclePromise, "f");
    }
    timeoutOrTerminationPromise() {
        return Promise.race([__classPrivateFieldGet(this, _LifecycleWatcher_timeoutPromise, "f"), __classPrivateFieldGet(this, _LifecycleWatcher_terminationPromise, "f")]);
    }
    dispose() {
        removeEventListeners(__classPrivateFieldGet(this, _LifecycleWatcher_eventListeners, "f"));
        __classPrivateFieldGet(this, _LifecycleWatcher_maximumTimer, "f") !== undefined && clearTimeout(__classPrivateFieldGet(this, _LifecycleWatcher_maximumTimer, "f"));
    }
}
_LifecycleWatcher_expectedLifecycle = new WeakMap(), _LifecycleWatcher_frameManager = new WeakMap(), _LifecycleWatcher_frame = new WeakMap(), _LifecycleWatcher_timeout = new WeakMap(), _LifecycleWatcher_navigationRequest = new WeakMap(), _LifecycleWatcher_eventListeners = new WeakMap(), _LifecycleWatcher_sameDocumentNavigationCompleteCallback = new WeakMap(), _LifecycleWatcher_sameDocumentNavigationPromise = new WeakMap(), _LifecycleWatcher_lifecycleCallback = new WeakMap(), _LifecycleWatcher_lifecyclePromise = new WeakMap(), _LifecycleWatcher_newDocumentNavigationCompleteCallback = new WeakMap(), _LifecycleWatcher_newDocumentNavigationPromise = new WeakMap(), _LifecycleWatcher_terminationCallback = new WeakMap(), _LifecycleWatcher_terminationPromise = new WeakMap(), _LifecycleWatcher_timeoutPromise = new WeakMap(), _LifecycleWatcher_maximumTimer = new WeakMap(), _LifecycleWatcher_hasSameDocumentNavigation = new WeakMap(), _LifecycleWatcher_newDocumentNavigation = new WeakMap(), _LifecycleWatcher_swapped = new WeakMap(), _LifecycleWatcher_instances = new WeakSet(), _LifecycleWatcher_onRequest = function _LifecycleWatcher_onRequest(request) {
    if (request.frame() !== __classPrivateFieldGet(this, _LifecycleWatcher_frame, "f") || !request.isNavigationRequest()) {
        return;
    }
    __classPrivateFieldSet(this, _LifecycleWatcher_navigationRequest, request, "f");
}, _LifecycleWatcher_onFrameDetached = function _LifecycleWatcher_onFrameDetached(frame) {
    if (__classPrivateFieldGet(this, _LifecycleWatcher_frame, "f") === frame) {
        __classPrivateFieldGet(this, _LifecycleWatcher_terminationCallback, "f").call(null, new Error('Navigating frame was detached'));
        return;
    }
    __classPrivateFieldGet(this, _LifecycleWatcher_instances, "m", _LifecycleWatcher_checkLifecycleComplete).call(this);
}, _LifecycleWatcher_terminate = function _LifecycleWatcher_terminate(error) {
    __classPrivateFieldGet(this, _LifecycleWatcher_terminationCallback, "f").call(null, error);
}, _LifecycleWatcher_createTimeoutPromise = async function _LifecycleWatcher_createTimeoutPromise() {
    if (!__classPrivateFieldGet(this, _LifecycleWatcher_timeout, "f")) {
        return new Promise(noop);
    }
    const errorMessage = 'Navigation timeout of ' + __classPrivateFieldGet(this, _LifecycleWatcher_timeout, "f") + ' ms exceeded';
    await new Promise(fulfill => {
        return (__classPrivateFieldSet(this, _LifecycleWatcher_maximumTimer, setTimeout(fulfill, __classPrivateFieldGet(this, _LifecycleWatcher_timeout, "f")), "f"));
    });
    return new TimeoutError(errorMessage);
}, _LifecycleWatcher_navigatedWithinDocument = function _LifecycleWatcher_navigatedWithinDocument(frame) {
    if (frame !== __classPrivateFieldGet(this, _LifecycleWatcher_frame, "f")) {
        return;
    }
    __classPrivateFieldSet(this, _LifecycleWatcher_hasSameDocumentNavigation, true, "f");
    __classPrivateFieldGet(this, _LifecycleWatcher_instances, "m", _LifecycleWatcher_checkLifecycleComplete).call(this);
}, _LifecycleWatcher_navigated = function _LifecycleWatcher_navigated(frame) {
    if (frame !== __classPrivateFieldGet(this, _LifecycleWatcher_frame, "f")) {
        return;
    }
    __classPrivateFieldSet(this, _LifecycleWatcher_newDocumentNavigation, true, "f");
    __classPrivateFieldGet(this, _LifecycleWatcher_instances, "m", _LifecycleWatcher_checkLifecycleComplete).call(this);
}, _LifecycleWatcher_frameSwapped = function _LifecycleWatcher_frameSwapped(frame) {
    if (frame !== __classPrivateFieldGet(this, _LifecycleWatcher_frame, "f")) {
        return;
    }
    __classPrivateFieldSet(this, _LifecycleWatcher_swapped, true, "f");
    __classPrivateFieldGet(this, _LifecycleWatcher_instances, "m", _LifecycleWatcher_checkLifecycleComplete).call(this);
}, _LifecycleWatcher_checkLifecycleComplete = function _LifecycleWatcher_checkLifecycleComplete() {
    // We expect navigation to commit.
    if (!checkLifecycle(__classPrivateFieldGet(this, _LifecycleWatcher_frame, "f"), __classPrivateFieldGet(this, _LifecycleWatcher_expectedLifecycle, "f"))) {
        return;
    }
    __classPrivateFieldGet(this, _LifecycleWatcher_lifecycleCallback, "f").call(this);
    if (__classPrivateFieldGet(this, _LifecycleWatcher_hasSameDocumentNavigation, "f")) {
        __classPrivateFieldGet(this, _LifecycleWatcher_sameDocumentNavigationCompleteCallback, "f").call(this);
    }
    if (__classPrivateFieldGet(this, _LifecycleWatcher_swapped, "f") || __classPrivateFieldGet(this, _LifecycleWatcher_newDocumentNavigation, "f")) {
        __classPrivateFieldGet(this, _LifecycleWatcher_newDocumentNavigationCompleteCallback, "f").call(this);
    }
    function checkLifecycle(frame, expectedLifecycle) {
        for (const event of expectedLifecycle) {
            if (!frame._lifecycleEvents.has(event)) {
                return false;
            }
        }
        for (const child of frame.childFrames()) {
            if (child._hasStartedLoading &&
                !checkLifecycle(child, expectedLifecycle)) {
                return false;
            }
        }
        return true;
    }
};
//# sourceMappingURL=LifecycleWatcher.js.map