/**
 * Copyright 2017 Google Inc. All rights reserved.
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
var _FrameManager_instances, _FrameManager_page, _FrameManager_networkManager, _FrameManager_timeoutSettings, _FrameManager_frames, _FrameManager_contextIdToContext, _FrameManager_isolatedWorlds, _FrameManager_mainFrame, _FrameManager_client, _FrameManager_onAttachedToTarget, _FrameManager_onDetachedFromTarget, _FrameManager_onLifecycleEvent, _FrameManager_onFrameStartedLoading, _FrameManager_onFrameStoppedLoading, _FrameManager_handleFrameTree, _FrameManager_onFrameAttached, _FrameManager_onFrameNavigated, _FrameManager_onFrameNavigatedWithinDocument, _FrameManager_onFrameDetached, _FrameManager_onExecutionContextCreated, _FrameManager_onExecutionContextDestroyed, _FrameManager_onExecutionContextsCleared, _FrameManager_removeFramesRecursively, _Frame_parentFrame, _Frame_url, _Frame_detached, _Frame_client;
import { assert } from './assert.js';
import { Connection } from './Connection.js';
import { DOMWorld } from './DOMWorld.js';
import { EventEmitter } from './EventEmitter.js';
import { EVALUATION_SCRIPT_URL, ExecutionContext } from './ExecutionContext.js';
import { LifecycleWatcher } from './LifecycleWatcher.js';
import { NetworkManager } from './NetworkManager.js';
import { debugError, isErrorLike } from './util.js';
const UTILITY_WORLD_NAME = '__puppeteer_utility_world__';
/**
 * We use symbols to prevent external parties listening to these events.
 * They are internal to Puppeteer.
 *
 * @internal
 */
export const FrameManagerEmittedEvents = {
    FrameAttached: Symbol('FrameManager.FrameAttached'),
    FrameNavigated: Symbol('FrameManager.FrameNavigated'),
    FrameDetached: Symbol('FrameManager.FrameDetached'),
    FrameSwapped: Symbol('FrameManager.FrameSwapped'),
    LifecycleEvent: Symbol('FrameManager.LifecycleEvent'),
    FrameNavigatedWithinDocument: Symbol('FrameManager.FrameNavigatedWithinDocument'),
    ExecutionContextCreated: Symbol('FrameManager.ExecutionContextCreated'),
    ExecutionContextDestroyed: Symbol('FrameManager.ExecutionContextDestroyed'),
};
/**
 * @internal
 */
export class FrameManager extends EventEmitter {
    constructor(client, page, ignoreHTTPSErrors, timeoutSettings) {
        super();
        _FrameManager_instances.add(this);
        _FrameManager_page.set(this, void 0);
        _FrameManager_networkManager.set(this, void 0);
        _FrameManager_timeoutSettings.set(this, void 0);
        _FrameManager_frames.set(this, new Map());
        _FrameManager_contextIdToContext.set(this, new Map());
        _FrameManager_isolatedWorlds.set(this, new Set());
        _FrameManager_mainFrame.set(this, void 0);
        _FrameManager_client.set(this, void 0);
        __classPrivateFieldSet(this, _FrameManager_client, client, "f");
        __classPrivateFieldSet(this, _FrameManager_page, page, "f");
        __classPrivateFieldSet(this, _FrameManager_networkManager, new NetworkManager(client, ignoreHTTPSErrors, this), "f");
        __classPrivateFieldSet(this, _FrameManager_timeoutSettings, timeoutSettings, "f");
        this.setupEventListeners(__classPrivateFieldGet(this, _FrameManager_client, "f"));
    }
    /**
     * @internal
     */
    get _timeoutSettings() {
        return __classPrivateFieldGet(this, _FrameManager_timeoutSettings, "f");
    }
    /**
     * @internal
     */
    get _client() {
        return __classPrivateFieldGet(this, _FrameManager_client, "f");
    }
    setupEventListeners(session) {
        session.on('Page.frameAttached', event => {
            __classPrivateFieldGet(this, _FrameManager_instances, "m", _FrameManager_onFrameAttached).call(this, session, event.frameId, event.parentFrameId);
        });
        session.on('Page.frameNavigated', event => {
            __classPrivateFieldGet(this, _FrameManager_instances, "m", _FrameManager_onFrameNavigated).call(this, event.frame);
        });
        session.on('Page.navigatedWithinDocument', event => {
            __classPrivateFieldGet(this, _FrameManager_instances, "m", _FrameManager_onFrameNavigatedWithinDocument).call(this, event.frameId, event.url);
        });
        session.on('Page.frameDetached', (event) => {
            __classPrivateFieldGet(this, _FrameManager_instances, "m", _FrameManager_onFrameDetached).call(this, event.frameId, event.reason);
        });
        session.on('Page.frameStartedLoading', event => {
            __classPrivateFieldGet(this, _FrameManager_instances, "m", _FrameManager_onFrameStartedLoading).call(this, event.frameId);
        });
        session.on('Page.frameStoppedLoading', event => {
            __classPrivateFieldGet(this, _FrameManager_instances, "m", _FrameManager_onFrameStoppedLoading).call(this, event.frameId);
        });
        session.on('Runtime.executionContextCreated', event => {
            __classPrivateFieldGet(this, _FrameManager_instances, "m", _FrameManager_onExecutionContextCreated).call(this, event.context, session);
        });
        session.on('Runtime.executionContextDestroyed', event => {
            __classPrivateFieldGet(this, _FrameManager_instances, "m", _FrameManager_onExecutionContextDestroyed).call(this, event.executionContextId, session);
        });
        session.on('Runtime.executionContextsCleared', () => {
            __classPrivateFieldGet(this, _FrameManager_instances, "m", _FrameManager_onExecutionContextsCleared).call(this, session);
        });
        session.on('Page.lifecycleEvent', event => {
            __classPrivateFieldGet(this, _FrameManager_instances, "m", _FrameManager_onLifecycleEvent).call(this, event);
        });
        session.on('Target.attachedToTarget', async (event) => {
            __classPrivateFieldGet(this, _FrameManager_instances, "m", _FrameManager_onAttachedToTarget).call(this, event);
        });
        session.on('Target.detachedFromTarget', async (event) => {
            __classPrivateFieldGet(this, _FrameManager_instances, "m", _FrameManager_onDetachedFromTarget).call(this, event);
        });
    }
    async initialize(client = __classPrivateFieldGet(this, _FrameManager_client, "f")) {
        try {
            const result = await Promise.all([
                client.send('Page.enable'),
                client.send('Page.getFrameTree'),
                client !== __classPrivateFieldGet(this, _FrameManager_client, "f")
                    ? client.send('Target.setAutoAttach', {
                        autoAttach: true,
                        waitForDebuggerOnStart: false,
                        flatten: true,
                    })
                    : Promise.resolve(),
            ]);
            const { frameTree } = result[1];
            __classPrivateFieldGet(this, _FrameManager_instances, "m", _FrameManager_handleFrameTree).call(this, client, frameTree);
            await Promise.all([
                client.send('Page.setLifecycleEventsEnabled', { enabled: true }),
                client.send('Runtime.enable').then(() => {
                    return this._ensureIsolatedWorld(client, UTILITY_WORLD_NAME);
                }),
                // TODO: Network manager is not aware of OOP iframes yet.
                client === __classPrivateFieldGet(this, _FrameManager_client, "f")
                    ? __classPrivateFieldGet(this, _FrameManager_networkManager, "f").initialize()
                    : Promise.resolve(),
            ]);
        }
        catch (error) {
            // The target might have been closed before the initialization finished.
            if (isErrorLike(error) &&
                (error.message.includes('Target closed') ||
                    error.message.includes('Session closed'))) {
                return;
            }
            throw error;
        }
    }
    networkManager() {
        return __classPrivateFieldGet(this, _FrameManager_networkManager, "f");
    }
    async navigateFrame(frame, url, options = {}) {
        assertNoLegacyNavigationOptions(options);
        const { referer = __classPrivateFieldGet(this, _FrameManager_networkManager, "f").extraHTTPHeaders()['referer'], waitUntil = ['load'], timeout = __classPrivateFieldGet(this, _FrameManager_timeoutSettings, "f").navigationTimeout(), } = options;
        const watcher = new LifecycleWatcher(this, frame, waitUntil, timeout);
        let error = await Promise.race([
            navigate(__classPrivateFieldGet(this, _FrameManager_client, "f"), url, referer, frame._id),
            watcher.timeoutOrTerminationPromise(),
        ]);
        if (!error) {
            error = await Promise.race([
                watcher.timeoutOrTerminationPromise(),
                watcher.newDocumentNavigationPromise(),
                watcher.sameDocumentNavigationPromise(),
            ]);
        }
        watcher.dispose();
        if (error) {
            throw error;
        }
        return await watcher.navigationResponse();
        async function navigate(client, url, referrer, frameId) {
            try {
                const response = await client.send('Page.navigate', {
                    url,
                    referrer,
                    frameId,
                });
                return response.errorText
                    ? new Error(`${response.errorText} at ${url}`)
                    : null;
            }
            catch (error) {
                if (isErrorLike(error)) {
                    return error;
                }
                throw error;
            }
        }
    }
    async waitForFrameNavigation(frame, options = {}) {
        assertNoLegacyNavigationOptions(options);
        const { waitUntil = ['load'], timeout = __classPrivateFieldGet(this, _FrameManager_timeoutSettings, "f").navigationTimeout(), } = options;
        const watcher = new LifecycleWatcher(this, frame, waitUntil, timeout);
        const error = await Promise.race([
            watcher.timeoutOrTerminationPromise(),
            watcher.sameDocumentNavigationPromise(),
            watcher.newDocumentNavigationPromise(),
        ]);
        watcher.dispose();
        if (error) {
            throw error;
        }
        return await watcher.navigationResponse();
    }
    page() {
        return __classPrivateFieldGet(this, _FrameManager_page, "f");
    }
    mainFrame() {
        assert(__classPrivateFieldGet(this, _FrameManager_mainFrame, "f"), 'Requesting main frame too early!');
        return __classPrivateFieldGet(this, _FrameManager_mainFrame, "f");
    }
    frames() {
        return Array.from(__classPrivateFieldGet(this, _FrameManager_frames, "f").values());
    }
    frame(frameId) {
        return __classPrivateFieldGet(this, _FrameManager_frames, "f").get(frameId) || null;
    }
    async _ensureIsolatedWorld(session, name) {
        const key = `${session.id()}:${name}`;
        if (__classPrivateFieldGet(this, _FrameManager_isolatedWorlds, "f").has(key)) {
            return;
        }
        __classPrivateFieldGet(this, _FrameManager_isolatedWorlds, "f").add(key);
        await session.send('Page.addScriptToEvaluateOnNewDocument', {
            source: `//# sourceURL=${EVALUATION_SCRIPT_URL}`,
            worldName: name,
        });
        // Frames might be removed before we send this.
        await Promise.all(this.frames()
            .filter(frame => {
            return frame._client() === session;
        })
            .map(frame => {
            return session
                .send('Page.createIsolatedWorld', {
                frameId: frame._id,
                worldName: name,
                grantUniveralAccess: true,
            })
                .catch(debugError);
        }));
    }
    executionContextById(contextId, session = __classPrivateFieldGet(this, _FrameManager_client, "f")) {
        const key = `${session.id()}:${contextId}`;
        const context = __classPrivateFieldGet(this, _FrameManager_contextIdToContext, "f").get(key);
        assert(context, 'INTERNAL ERROR: missing context with id = ' + contextId);
        return context;
    }
}
_FrameManager_page = new WeakMap(), _FrameManager_networkManager = new WeakMap(), _FrameManager_timeoutSettings = new WeakMap(), _FrameManager_frames = new WeakMap(), _FrameManager_contextIdToContext = new WeakMap(), _FrameManager_isolatedWorlds = new WeakMap(), _FrameManager_mainFrame = new WeakMap(), _FrameManager_client = new WeakMap(), _FrameManager_instances = new WeakSet(), _FrameManager_onAttachedToTarget = async function _FrameManager_onAttachedToTarget(event) {
    if (event.targetInfo.type !== 'iframe') {
        return;
    }
    const frame = __classPrivateFieldGet(this, _FrameManager_frames, "f").get(event.targetInfo.targetId);
    const connection = Connection.fromSession(__classPrivateFieldGet(this, _FrameManager_client, "f"));
    assert(connection);
    const session = connection.session(event.sessionId);
    assert(session);
    if (frame) {
        frame._updateClient(session);
    }
    this.setupEventListeners(session);
    await this.initialize(session);
}, _FrameManager_onDetachedFromTarget = async function _FrameManager_onDetachedFromTarget(event) {
    if (!event.targetId) {
        return;
    }
    const frame = __classPrivateFieldGet(this, _FrameManager_frames, "f").get(event.targetId);
    if (frame && frame.isOOPFrame()) {
        // When an OOP iframe is removed from the page, it
        // will only get a Target.detachedFromTarget event.
        __classPrivateFieldGet(this, _FrameManager_instances, "m", _FrameManager_removeFramesRecursively).call(this, frame);
    }
}, _FrameManager_onLifecycleEvent = function _FrameManager_onLifecycleEvent(event) {
    const frame = __classPrivateFieldGet(this, _FrameManager_frames, "f").get(event.frameId);
    if (!frame) {
        return;
    }
    frame._onLifecycleEvent(event.loaderId, event.name);
    this.emit(FrameManagerEmittedEvents.LifecycleEvent, frame);
}, _FrameManager_onFrameStartedLoading = function _FrameManager_onFrameStartedLoading(frameId) {
    const frame = __classPrivateFieldGet(this, _FrameManager_frames, "f").get(frameId);
    if (!frame) {
        return;
    }
    frame._onLoadingStarted();
}, _FrameManager_onFrameStoppedLoading = function _FrameManager_onFrameStoppedLoading(frameId) {
    const frame = __classPrivateFieldGet(this, _FrameManager_frames, "f").get(frameId);
    if (!frame) {
        return;
    }
    frame._onLoadingStopped();
    this.emit(FrameManagerEmittedEvents.LifecycleEvent, frame);
}, _FrameManager_handleFrameTree = function _FrameManager_handleFrameTree(session, frameTree) {
    if (frameTree.frame.parentId) {
        __classPrivateFieldGet(this, _FrameManager_instances, "m", _FrameManager_onFrameAttached).call(this, session, frameTree.frame.id, frameTree.frame.parentId);
    }
    __classPrivateFieldGet(this, _FrameManager_instances, "m", _FrameManager_onFrameNavigated).call(this, frameTree.frame);
    if (!frameTree.childFrames) {
        return;
    }
    for (const child of frameTree.childFrames) {
        __classPrivateFieldGet(this, _FrameManager_instances, "m", _FrameManager_handleFrameTree).call(this, session, child);
    }
}, _FrameManager_onFrameAttached = function _FrameManager_onFrameAttached(session, frameId, parentFrameId) {
    if (__classPrivateFieldGet(this, _FrameManager_frames, "f").has(frameId)) {
        const frame = __classPrivateFieldGet(this, _FrameManager_frames, "f").get(frameId);
        if (session && frame.isOOPFrame()) {
            // If an OOP iframes becomes a normal iframe again
            // it is first attached to the parent page before
            // the target is removed.
            frame._updateClient(session);
        }
        return;
    }
    assert(parentFrameId);
    const parentFrame = __classPrivateFieldGet(this, _FrameManager_frames, "f").get(parentFrameId);
    assert(parentFrame);
    const frame = new Frame(this, parentFrame, frameId, session);
    __classPrivateFieldGet(this, _FrameManager_frames, "f").set(frame._id, frame);
    this.emit(FrameManagerEmittedEvents.FrameAttached, frame);
}, _FrameManager_onFrameNavigated = function _FrameManager_onFrameNavigated(framePayload) {
    const isMainFrame = !framePayload.parentId;
    let frame = isMainFrame
        ? __classPrivateFieldGet(this, _FrameManager_mainFrame, "f")
        : __classPrivateFieldGet(this, _FrameManager_frames, "f").get(framePayload.id);
    assert(isMainFrame || frame, 'We either navigate top level or have old version of the navigated frame');
    // Detach all child frames first.
    if (frame) {
        for (const child of frame.childFrames()) {
            __classPrivateFieldGet(this, _FrameManager_instances, "m", _FrameManager_removeFramesRecursively).call(this, child);
        }
    }
    // Update or create main frame.
    if (isMainFrame) {
        if (frame) {
            // Update frame id to retain frame identity on cross-process navigation.
            __classPrivateFieldGet(this, _FrameManager_frames, "f").delete(frame._id);
            frame._id = framePayload.id;
        }
        else {
            // Initial main frame navigation.
            frame = new Frame(this, null, framePayload.id, __classPrivateFieldGet(this, _FrameManager_client, "f"));
        }
        __classPrivateFieldGet(this, _FrameManager_frames, "f").set(framePayload.id, frame);
        __classPrivateFieldSet(this, _FrameManager_mainFrame, frame, "f");
    }
    // Update frame payload.
    assert(frame);
    frame._navigated(framePayload);
    this.emit(FrameManagerEmittedEvents.FrameNavigated, frame);
}, _FrameManager_onFrameNavigatedWithinDocument = function _FrameManager_onFrameNavigatedWithinDocument(frameId, url) {
    const frame = __classPrivateFieldGet(this, _FrameManager_frames, "f").get(frameId);
    if (!frame) {
        return;
    }
    frame._navigatedWithinDocument(url);
    this.emit(FrameManagerEmittedEvents.FrameNavigatedWithinDocument, frame);
    this.emit(FrameManagerEmittedEvents.FrameNavigated, frame);
}, _FrameManager_onFrameDetached = function _FrameManager_onFrameDetached(frameId, reason) {
    const frame = __classPrivateFieldGet(this, _FrameManager_frames, "f").get(frameId);
    if (reason === 'remove') {
        // Only remove the frame if the reason for the detached event is
        // an actual removement of the frame.
        // For frames that become OOP iframes, the reason would be 'swap'.
        if (frame) {
            __classPrivateFieldGet(this, _FrameManager_instances, "m", _FrameManager_removeFramesRecursively).call(this, frame);
        }
    }
    else if (reason === 'swap') {
        this.emit(FrameManagerEmittedEvents.FrameSwapped, frame);
    }
}, _FrameManager_onExecutionContextCreated = function _FrameManager_onExecutionContextCreated(contextPayload, session) {
    const auxData = contextPayload.auxData;
    const frameId = auxData && auxData.frameId;
    const frame = typeof frameId === 'string' ? __classPrivateFieldGet(this, _FrameManager_frames, "f").get(frameId) : undefined;
    let world;
    if (frame) {
        // Only care about execution contexts created for the current session.
        if (frame._client() !== session) {
            return;
        }
        if (contextPayload.auxData && !!contextPayload.auxData['isDefault']) {
            world = frame._mainWorld;
        }
        else if (contextPayload.name === UTILITY_WORLD_NAME &&
            !frame._secondaryWorld._hasContext()) {
            // In case of multiple sessions to the same target, there's a race between
            // connections so we might end up creating multiple isolated worlds.
            // We can use either.
            world = frame._secondaryWorld;
        }
    }
    const context = new ExecutionContext((frame === null || frame === void 0 ? void 0 : frame._client()) || __classPrivateFieldGet(this, _FrameManager_client, "f"), contextPayload, world);
    if (world) {
        world._setContext(context);
    }
    const key = `${session.id()}:${contextPayload.id}`;
    __classPrivateFieldGet(this, _FrameManager_contextIdToContext, "f").set(key, context);
}, _FrameManager_onExecutionContextDestroyed = function _FrameManager_onExecutionContextDestroyed(executionContextId, session) {
    const key = `${session.id()}:${executionContextId}`;
    const context = __classPrivateFieldGet(this, _FrameManager_contextIdToContext, "f").get(key);
    if (!context) {
        return;
    }
    __classPrivateFieldGet(this, _FrameManager_contextIdToContext, "f").delete(key);
    if (context._world) {
        context._world._setContext(null);
    }
}, _FrameManager_onExecutionContextsCleared = function _FrameManager_onExecutionContextsCleared(session) {
    for (const [key, context] of __classPrivateFieldGet(this, _FrameManager_contextIdToContext, "f").entries()) {
        // Make sure to only clear execution contexts that belong
        // to the current session.
        if (context._client !== session) {
            continue;
        }
        if (context._world) {
            context._world._setContext(null);
        }
        __classPrivateFieldGet(this, _FrameManager_contextIdToContext, "f").delete(key);
    }
}, _FrameManager_removeFramesRecursively = function _FrameManager_removeFramesRecursively(frame) {
    for (const child of frame.childFrames()) {
        __classPrivateFieldGet(this, _FrameManager_instances, "m", _FrameManager_removeFramesRecursively).call(this, child);
    }
    frame._detach();
    __classPrivateFieldGet(this, _FrameManager_frames, "f").delete(frame._id);
    this.emit(FrameManagerEmittedEvents.FrameDetached, frame);
};
/**
 * At every point of time, page exposes its current frame tree via the
 * {@link Page.mainFrame | page.mainFrame} and
 * {@link Frame.childFrames | frame.childFrames} methods.
 *
 * @remarks
 *
 * `Frame` object lifecycles are controlled by three events that are all
 * dispatched on the page object:
 *
 * - {@link PageEmittedEvents.FrameAttached}
 *
 * - {@link PageEmittedEvents.FrameNavigated}
 *
 * - {@link PageEmittedEvents.FrameDetached}
 *
 * @Example
 * An example of dumping frame tree:
 *
 * ```ts
 * const puppeteer = require('puppeteer');
 *
 * (async () => {
 *   const browser = await puppeteer.launch();
 *   const page = await browser.newPage();
 *   await page.goto('https://www.google.com/chrome/browser/canary.html');
 *   dumpFrameTree(page.mainFrame(), '');
 *   await browser.close();
 *
 *   function dumpFrameTree(frame, indent) {
 *     console.log(indent + frame.url());
 *     for (const child of frame.childFrames()) {
 *     dumpFrameTree(child, indent + '  ');
 *     }
 *   }
 * })();
 * ```
 *
 * @Example
 * An example of getting text from an iframe element:
 *
 * ```ts
 * const frame = page.frames().find(frame => frame.name() === 'myframe');
 * const text = await frame.$eval('.selector', element => element.textContent);
 * console.log(text);
 * ```
 *
 * @public
 */
export class Frame {
    /**
     * @internal
     */
    constructor(frameManager, parentFrame, frameId, client) {
        _Frame_parentFrame.set(this, void 0);
        _Frame_url.set(this, '');
        _Frame_detached.set(this, false);
        _Frame_client.set(this, void 0);
        /**
         * @internal
         */
        this._loaderId = '';
        /**
         * @internal
         */
        this._hasStartedLoading = false;
        /**
         * @internal
         */
        this._lifecycleEvents = new Set();
        this._frameManager = frameManager;
        __classPrivateFieldSet(this, _Frame_parentFrame, parentFrame !== null && parentFrame !== void 0 ? parentFrame : null, "f");
        __classPrivateFieldSet(this, _Frame_url, '', "f");
        this._id = frameId;
        __classPrivateFieldSet(this, _Frame_detached, false, "f");
        this._loaderId = '';
        this._childFrames = new Set();
        if (__classPrivateFieldGet(this, _Frame_parentFrame, "f")) {
            __classPrivateFieldGet(this, _Frame_parentFrame, "f")._childFrames.add(this);
        }
        this._updateClient(client);
    }
    /**
     * @internal
     */
    _updateClient(client) {
        __classPrivateFieldSet(this, _Frame_client, client, "f");
        this._mainWorld = new DOMWorld(__classPrivateFieldGet(this, _Frame_client, "f"), this._frameManager, this, this._frameManager._timeoutSettings);
        this._secondaryWorld = new DOMWorld(__classPrivateFieldGet(this, _Frame_client, "f"), this._frameManager, this, this._frameManager._timeoutSettings);
    }
    /**
     * @remarks
     *
     * @returns `true` if the frame is an OOP frame, or `false` otherwise.
     */
    isOOPFrame() {
        return __classPrivateFieldGet(this, _Frame_client, "f") !== this._frameManager._client;
    }
    /**
     * @remarks
     *
     * `frame.goto` will throw an error if:
     * - there's an SSL error (e.g. in case of self-signed certificates).
     *
     * - target URL is invalid.
     *
     * - the `timeout` is exceeded during navigation.
     *
     * - the remote server does not respond or is unreachable.
     *
     * - the main resource failed to load.
     *
     * `frame.goto` will not throw an error when any valid HTTP status code is
     * returned by the remote server, including 404 "Not Found" and 500 "Internal
     * Server Error".  The status code for such responses can be retrieved by
     * calling {@link HTTPResponse.status}.
     *
     * NOTE: `frame.goto` either throws an error or returns a main resource
     * response. The only exceptions are navigation to `about:blank` or
     * navigation to the same URL with a different hash, which would succeed and
     * return `null`.
     *
     * NOTE: Headless mode doesn't support navigation to a PDF document. See
     * the {@link https://bugs.chromium.org/p/chromium/issues/detail?id=761295 | upstream
     * issue}.
     *
     * @param url - the URL to navigate the frame to. This should include the
     * scheme, e.g. `https://`.
     * @param options - navigation options. `waitUntil` is useful to define when
     * the navigation should be considered successful - see the docs for
     * {@link PuppeteerLifeCycleEvent} for more details.
     *
     * @returns A promise which resolves to the main resource response. In case of
     * multiple redirects, the navigation will resolve with the response of the
     * last redirect.
     */
    async goto(url, options = {}) {
        return await this._frameManager.navigateFrame(this, url, options);
    }
    /**
     * @remarks
     *
     * This resolves when the frame navigates to a new URL. It is useful for when
     * you run code which will indirectly cause the frame to navigate. Consider
     * this example:
     *
     * ```ts
     * const [response] = await Promise.all([
     *   // The navigation promise resolves after navigation has finished
     *   frame.waitForNavigation(),
     *   // Clicking the link will indirectly cause a navigation
     *   frame.click('a.my-link'),
     * ]);
     * ```
     *
     * Usage of the {@link https://developer.mozilla.org/en-US/docs/Web/API/History_API | History API} to change the URL is considered a navigation.
     *
     * @param options - options to configure when the navigation is consided finished.
     * @returns a promise that resolves when the frame navigates to a new URL.
     */
    async waitForNavigation(options = {}) {
        return await this._frameManager.waitForFrameNavigation(this, options);
    }
    /**
     * @internal
     */
    _client() {
        return __classPrivateFieldGet(this, _Frame_client, "f");
    }
    /**
     * @returns a promise that resolves to the frame's default execution context.
     */
    executionContext() {
        return this._mainWorld.executionContext();
    }
    /**
     * @remarks
     *
     * The only difference between {@link Frame.evaluate} and
     * `frame.evaluateHandle` is that `evaluateHandle` will return the value
     * wrapped in an in-page object.
     *
     * This method behaves identically to {@link Page.evaluateHandle} except it's
     * run within the context of the `frame`, rather than the entire page.
     *
     * @param pageFunction - a function that is run within the frame
     * @param args - arguments to be passed to the pageFunction
     */
    async evaluateHandle(pageFunction, ...args) {
        return this._mainWorld.evaluateHandle(pageFunction, ...args);
    }
    /**
     * @remarks
     *
     * This method behaves identically to {@link Page.evaluate} except it's run
     * within the context of the `frame`, rather than the entire page.
     *
     * @param pageFunction - a function that is run within the frame
     * @param args - arguments to be passed to the pageFunction
     */
    async evaluate(pageFunction, ...args) {
        return this._mainWorld.evaluate(pageFunction, ...args);
    }
    /**
     * This method queries the frame for the given selector.
     *
     * @param selector - a selector to query for.
     * @returns A promise which resolves to an `ElementHandle` pointing at the
     * element, or `null` if it was not found.
     */
    async $(selector) {
        return this._mainWorld.$(selector);
    }
    /**
     * This runs `document.querySelectorAll` in the frame and returns the result.
     *
     * @param selector - a selector to search for
     * @returns An array of element handles pointing to the found frame elements.
     */
    async $$(selector) {
        return this._mainWorld.$$(selector);
    }
    /**
     * This method evaluates the given XPath expression and returns the results.
     *
     * @param expression - the XPath expression to evaluate.
     */
    async $x(expression) {
        return this._mainWorld.$x(expression);
    }
    /**
     * @remarks
     *
     * This method runs `document.querySelector` within
     * the frame and passes it as the first argument to `pageFunction`.
     *
     * If `pageFunction` returns a Promise, then `frame.$eval` would wait for
     * the promise to resolve and return its value.
     *
     * @example
     *
     * ```ts
     * const searchValue = await frame.$eval('#search', el => el.value);
     * ```
     *
     * @param selector - the selector to query for
     * @param pageFunction - the function to be evaluated in the frame's context
     * @param args - additional arguments to pass to `pageFunction`
     */
    async $eval(selector, pageFunction, ...args) {
        return this._mainWorld.$eval(selector, pageFunction, ...args);
    }
    /**
     * @remarks
     *
     * This method runs `Array.from(document.querySelectorAll(selector))` within
     * the frame and passes it as the first argument to `pageFunction`.
     *
     * If `pageFunction` returns a Promise, then `frame.$$eval` would wait for
     * the promise to resolve and return its value.
     *
     * @example
     *
     * ```ts
     * const divsCounts = await frame.$$eval('div', divs => divs.length);
     * ```
     *
     * @param selector - the selector to query for
     * @param pageFunction - the function to be evaluated in the frame's context
     * @param args - additional arguments to pass to `pageFunction`
     */
    async $$eval(selector, pageFunction, ...args) {
        return this._mainWorld.$$eval(selector, pageFunction, ...args);
    }
    /**
     * @returns the full HTML contents of the frame, including the doctype.
     */
    async content() {
        return this._secondaryWorld.content();
    }
    /**
     * Set the content of the frame.
     *
     * @param html - HTML markup to assign to the page.
     * @param options - options to configure how long before timing out and at
     * what point to consider the content setting successful.
     */
    async setContent(html, options = {}) {
        return this._secondaryWorld.setContent(html, options);
    }
    /**
     * @remarks
     *
     * If the name is empty, it returns the `id` attribute instead.
     *
     * Note: This value is calculated once when the frame is created, and will not
     * update if the attribute is changed later.
     *
     * @returns the frame's `name` attribute as specified in the tag.
     */
    name() {
        return this._name || '';
    }
    /**
     * @returns the frame's URL.
     */
    url() {
        return __classPrivateFieldGet(this, _Frame_url, "f");
    }
    /**
     * @returns the parent `Frame`, if any. Detached and main frames return `null`.
     */
    parentFrame() {
        return __classPrivateFieldGet(this, _Frame_parentFrame, "f");
    }
    /**
     * @returns an array of child frames.
     */
    childFrames() {
        return Array.from(this._childFrames);
    }
    /**
     * @returns `true` if the frame has been detached, or `false` otherwise.
     */
    isDetached() {
        return __classPrivateFieldGet(this, _Frame_detached, "f");
    }
    /**
     * Adds a `<script>` tag into the page with the desired url or content.
     *
     * @param options - configure the script to add to the page.
     *
     * @returns a promise that resolves to the added tag when the script's
     * `onload` event fires or when the script content was injected into the
     * frame.
     */
    async addScriptTag(options) {
        return this._mainWorld.addScriptTag(options);
    }
    /**
     * Adds a `<link rel="stylesheet">` tag into the page with the desired url or
     * a `<style type="text/css">` tag with the content.
     *
     * @param options - configure the CSS to add to the page.
     *
     * @returns a promise that resolves to the added tag when the stylesheets's
     * `onload` event fires or when the CSS content was injected into the
     * frame.
     */
    async addStyleTag(options) {
        return this._mainWorld.addStyleTag(options);
    }
    /**
     *
     * This method clicks the first element found that matches `selector`.
     *
     * @remarks
     *
     * This method scrolls the element into view if needed, and then uses
     * {@link Page.mouse} to click in the center of the element. If there's no
     * element matching `selector`, the method throws an error.
     *
     * Bear in mind that if `click()` triggers a navigation event and there's a
     * separate `page.waitForNavigation()` promise to be resolved, you may end up
     * with a race condition that yields unexpected results. The correct pattern
     * for click and wait for navigation is the following:
     *
     * ```javascript
     * const [response] = await Promise.all([
     *   page.waitForNavigation(waitOptions),
     *   frame.click(selector, clickOptions),
     * ]);
     * ```
     * @param selector - the selector to search for to click. If there are
     * multiple elements, the first will be clicked.
     */
    async click(selector, options = {}) {
        return this._secondaryWorld.click(selector, options);
    }
    /**
     * This method fetches an element with `selector` and focuses it.
     *
     * @remarks
     * If there's no element matching `selector`, the method throws an error.
     *
     * @param selector - the selector for the element to focus. If there are
     * multiple elements, the first will be focused.
     */
    async focus(selector) {
        return this._secondaryWorld.focus(selector);
    }
    /**
     * This method fetches an element with `selector`, scrolls it into view if
     * needed, and then uses {@link Page.mouse} to hover over the center of the
     * element.
     *
     * @remarks
     * If there's no element matching `selector`, the method throws an
     *
     * @param selector - the selector for the element to hover. If there are
     * multiple elements, the first will be hovered.
     */
    async hover(selector) {
        return this._secondaryWorld.hover(selector);
    }
    /**
     * Triggers a `change` and `input` event once all the provided options have
     * been selected.
     *
     * @remarks
     *
     * If there's no `<select>` element matching `selector`, the
     * method throws an error.
     *
     * @example
     * ```ts
     * frame.select('select#colors', 'blue'); // single selection
     * frame.select('select#colors', 'red', 'green', 'blue'); // multiple selections
     * ```
     *
     * @param selector - a selector to query the frame for
     * @param values - an array of values to select. If the `<select>` has the
     * `multiple` attribute, all values are considered, otherwise only the first
     * one is taken into account.
     * @returns the list of values that were successfully selected.
     */
    select(selector, ...values) {
        return this._secondaryWorld.select(selector, ...values);
    }
    /**
     * This method fetches an element with `selector`, scrolls it into view if
     * needed, and then uses {@link Page.touchscreen} to tap in the center of the
     * element.
     *
     * @remarks
     *
     * If there's no element matching `selector`, the method throws an error.
     *
     * @param selector - the selector to tap.
     * @returns a promise that resolves when the element has been tapped.
     */
    async tap(selector) {
        return this._secondaryWorld.tap(selector);
    }
    /**
     * Sends a `keydown`, `keypress`/`input`, and `keyup` event for each character
     * in the text.
     *
     * @remarks
     * To press a special key, like `Control` or `ArrowDown`, use
     * {@link Keyboard.press}.
     *
     * @example
     * ```ts
     * await frame.type('#mytextarea', 'Hello'); // Types instantly
     * await frame.type('#mytextarea', 'World', {delay: 100}); // Types slower, like a user
     * ```
     *
     * @param selector - the selector for the element to type into. If there are
     * multiple the first will be used.
     * @param text - text to type into the element
     * @param options - takes one option, `delay`, which sets the time to wait
     * between key presses in milliseconds. Defaults to `0`.
     *
     * @returns a promise that resolves when the typing is complete.
     */
    async type(selector, text, options) {
        return this._mainWorld.type(selector, text, options);
    }
    /**
     * Causes your script to wait for the given number of milliseconds.
     *
     * @remarks
     * It's generally recommended to not wait for a number of seconds, but instead
     * use {@link Frame.waitForSelector}, {@link Frame.waitForXPath} or
     * {@link Frame.waitForFunction} to wait for exactly the conditions you want.
     *
     * @example
     *
     * Wait for 1 second:
     *
     * ```
     * await frame.waitForTimeout(1000);
     * ```
     *
     * @param milliseconds - the number of milliseconds to wait.
     */
    waitForTimeout(milliseconds) {
        return new Promise(resolve => {
            setTimeout(resolve, milliseconds);
        });
    }
    /**
     * @remarks
     *
     *
     * Wait for the `selector` to appear in page. If at the moment of calling the
     * method the `selector` already exists, the method will return immediately.
     * If the selector doesn't appear after the `timeout` milliseconds of waiting,
     * the function will throw.
     *
     * This method works across navigations.
     *
     * @example
     * ```ts
     * const puppeteer = require('puppeteer');
     *
     * (async () => {
     *   const browser = await puppeteer.launch();
     *   const page = await browser.newPage();
     *   let currentURL;
     *   page.mainFrame()
     *   .waitForSelector('img')
     *   .then(() => console.log('First URL with image: ' + currentURL));
     *
     *   for (currentURL of ['https://example.com', 'https://google.com', 'https://bbc.com']) {
     *     await page.goto(currentURL);
     *   }
     *   await browser.close();
     * })();
     * ```
     * @param selector - the selector to wait for.
     * @param options - options to define if the element should be visible and how
     * long to wait before timing out.
     * @returns a promise which resolves when an element matching the selector
     * string is added to the DOM.
     */
    async waitForSelector(selector, options = {}) {
        const handle = await this._secondaryWorld.waitForSelector(selector, options);
        if (!handle) {
            return null;
        }
        const mainExecutionContext = await this._mainWorld.executionContext();
        const result = await mainExecutionContext._adoptElementHandle(handle);
        await handle.dispose();
        return result;
    }
    /**
     * @remarks
     * Wait for the `xpath` to appear in page. If at the moment of calling the
     * method the `xpath` already exists, the method will return immediately. If
     * the xpath doesn't appear after the `timeout` milliseconds of waiting, the
     * function will throw.
     *
     * For a code example, see the example for {@link Frame.waitForSelector}. That
     * function behaves identically other than taking a CSS selector rather than
     * an XPath.
     *
     * @param xpath - the XPath expression to wait for.
     * @param options  - options to configure the visiblity of the element and how
     * long to wait before timing out.
     */
    async waitForXPath(xpath, options = {}) {
        const handle = await this._secondaryWorld.waitForXPath(xpath, options);
        if (!handle) {
            return null;
        }
        const mainExecutionContext = await this._mainWorld.executionContext();
        const result = await mainExecutionContext._adoptElementHandle(handle);
        await handle.dispose();
        return result;
    }
    /**
     * @remarks
     *
     * @example
     *
     * The `waitForFunction` can be used to observe viewport size change:
     * ```ts
     * const puppeteer = require('puppeteer');
     *
     * (async () => {
     * .  const browser = await puppeteer.launch();
     * .  const page = await browser.newPage();
     * .  const watchDog = page.mainFrame().waitForFunction('window.innerWidth < 100');
     * .  page.setViewport({width: 50, height: 50});
     * .  await watchDog;
     * .  await browser.close();
     * })();
     * ```
     *
     * To pass arguments from Node.js to the predicate of `page.waitForFunction` function:
     *
     * ```ts
     * const selector = '.foo';
     * await frame.waitForFunction(
     *   selector => !!document.querySelector(selector),
     *   {}, // empty options object
     *   selector
     *);
     * ```
     *
     * @param pageFunction - the function to evaluate in the frame context.
     * @param options - options to configure the polling method and timeout.
     * @param args - arguments to pass to the `pageFunction`.
     * @returns the promise which resolve when the `pageFunction` returns a truthy value.
     */
    waitForFunction(pageFunction, options = {}, ...args) {
        // TODO: Fix when NodeHandle has been added.
        return this._mainWorld.waitForFunction(pageFunction, options, ...args);
    }
    /**
     * @returns the frame's title.
     */
    async title() {
        return this._secondaryWorld.title();
    }
    /**
     * @internal
     */
    _navigated(framePayload) {
        this._name = framePayload.name;
        __classPrivateFieldSet(this, _Frame_url, `${framePayload.url}${framePayload.urlFragment || ''}`, "f");
    }
    /**
     * @internal
     */
    _navigatedWithinDocument(url) {
        __classPrivateFieldSet(this, _Frame_url, url, "f");
    }
    /**
     * @internal
     */
    _onLifecycleEvent(loaderId, name) {
        if (name === 'init') {
            this._loaderId = loaderId;
            this._lifecycleEvents.clear();
        }
        this._lifecycleEvents.add(name);
    }
    /**
     * @internal
     */
    _onLoadingStopped() {
        this._lifecycleEvents.add('DOMContentLoaded');
        this._lifecycleEvents.add('load');
    }
    /**
     * @internal
     */
    _onLoadingStarted() {
        this._hasStartedLoading = true;
    }
    /**
     * @internal
     */
    _detach() {
        __classPrivateFieldSet(this, _Frame_detached, true, "f");
        this._mainWorld._detach();
        this._secondaryWorld._detach();
        if (__classPrivateFieldGet(this, _Frame_parentFrame, "f")) {
            __classPrivateFieldGet(this, _Frame_parentFrame, "f")._childFrames.delete(this);
        }
        __classPrivateFieldSet(this, _Frame_parentFrame, null, "f");
    }
}
_Frame_parentFrame = new WeakMap(), _Frame_url = new WeakMap(), _Frame_detached = new WeakMap(), _Frame_client = new WeakMap();
function assertNoLegacyNavigationOptions(options) {
    assert(options['networkIdleTimeout'] === undefined, 'ERROR: networkIdleTimeout option is no longer supported.');
    assert(options['networkIdleInflight'] === undefined, 'ERROR: networkIdleInflight option is no longer supported.');
    assert(options['waitUntil'] !== 'networkidle', 'ERROR: "networkidle" option is no longer supported. Use "networkidle2" instead');
}
//# sourceMappingURL=FrameManager.js.map