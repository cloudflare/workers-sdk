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
var _Connection_instances, _Connection_url, _Connection_transport, _Connection_delay, _Connection_lastId, _Connection_sessions, _Connection_closed, _Connection_callbacks, _Connection_onClose, _CDPSession_sessionId, _CDPSession_targetType, _CDPSession_callbacks, _CDPSession_connection;
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
import { assert } from './assert.js';
import { debug } from './Debug.js';
const debugProtocolSend = debug('puppeteer:protocol:SEND ►');
const debugProtocolReceive = debug('puppeteer:protocol:RECV ◀');
import { EventEmitter } from './EventEmitter.js';
import { ProtocolError } from './Errors.js';
/**
 * Internal events that the Connection class emits.
 *
 * @internal
 */
export const ConnectionEmittedEvents = {
    Disconnected: Symbol('Connection.Disconnected'),
};
/**
 * @public
 */
export class Connection extends EventEmitter {
    constructor(url, transport, delay = 0) {
        super();
        _Connection_instances.add(this);
        _Connection_url.set(this, void 0);
        _Connection_transport.set(this, void 0);
        _Connection_delay.set(this, void 0);
        _Connection_lastId.set(this, 0);
        _Connection_sessions.set(this, new Map());
        _Connection_closed.set(this, false);
        _Connection_callbacks.set(this, new Map());
        __classPrivateFieldSet(this, _Connection_url, url, "f");
        __classPrivateFieldSet(this, _Connection_delay, delay, "f");
        __classPrivateFieldSet(this, _Connection_transport, transport, "f");
        __classPrivateFieldGet(this, _Connection_transport, "f").onmessage = this.onMessage.bind(this);
        __classPrivateFieldGet(this, _Connection_transport, "f").onclose = __classPrivateFieldGet(this, _Connection_instances, "m", _Connection_onClose).bind(this);
    }
    static fromSession(session) {
        return session.connection();
    }
    /**
     * @internal
     */
    get _closed() {
        return __classPrivateFieldGet(this, _Connection_closed, "f");
    }
    /**
     * @internal
     */
    get _sessions() {
        return __classPrivateFieldGet(this, _Connection_sessions, "f");
    }
    /**
     * @param sessionId - The session id
     * @returns The current CDP session if it exists
     */
    session(sessionId) {
        return __classPrivateFieldGet(this, _Connection_sessions, "f").get(sessionId) || null;
    }
    url() {
        return __classPrivateFieldGet(this, _Connection_url, "f");
    }
    send(method, ...paramArgs) {
        // There is only ever 1 param arg passed, but the Protocol defines it as an
        // array of 0 or 1 items See this comment:
        // https://github.com/ChromeDevTools/devtools-protocol/pull/113#issuecomment-412603285
        // which explains why the protocol defines the params this way for better
        // type-inference.
        // So now we check if there are any params or not and deal with them accordingly.
        const params = paramArgs.length ? paramArgs[0] : undefined;
        const id = this._rawSend({ method, params });
        return new Promise((resolve, reject) => {
            __classPrivateFieldGet(this, _Connection_callbacks, "f").set(id, {
                resolve,
                reject,
                error: new ProtocolError(),
                method,
            });
        });
    }
    /**
     * @internal
     */
    _rawSend(message) {
        var _a;
        const id = __classPrivateFieldSet(this, _Connection_lastId, (_a = __classPrivateFieldGet(this, _Connection_lastId, "f"), ++_a), "f");
        const stringifiedMessage = JSON.stringify(Object.assign({}, message, { id }));
        debugProtocolSend(stringifiedMessage);
        __classPrivateFieldGet(this, _Connection_transport, "f").send(stringifiedMessage);
        return id;
    }
    /**
     * @internal
     */
    async onMessage(message) {
        if (__classPrivateFieldGet(this, _Connection_delay, "f")) {
            await new Promise(f => {
                return setTimeout(f, __classPrivateFieldGet(this, _Connection_delay, "f"));
            });
        }
        debugProtocolReceive(message);
        const object = JSON.parse(message);
        if (object.method === 'Target.attachedToTarget') {
            const sessionId = object.params.sessionId;
            const session = new CDPSession(this, object.params.targetInfo.type, sessionId);
            __classPrivateFieldGet(this, _Connection_sessions, "f").set(sessionId, session);
            this.emit('sessionattached', session);
            const parentSession = __classPrivateFieldGet(this, _Connection_sessions, "f").get(object.sessionId);
            if (parentSession) {
                parentSession.emit('sessionattached', session);
            }
        }
        else if (object.method === 'Target.detachedFromTarget') {
            const session = __classPrivateFieldGet(this, _Connection_sessions, "f").get(object.params.sessionId);
            if (session) {
                session._onClosed();
                __classPrivateFieldGet(this, _Connection_sessions, "f").delete(object.params.sessionId);
                this.emit('sessiondetached', session);
                const parentSession = __classPrivateFieldGet(this, _Connection_sessions, "f").get(object.sessionId);
                if (parentSession) {
                    parentSession.emit('sessiondetached', session);
                }
            }
        }
        if (object.sessionId) {
            const session = __classPrivateFieldGet(this, _Connection_sessions, "f").get(object.sessionId);
            if (session) {
                session._onMessage(object);
            }
        }
        else if (object.id) {
            const callback = __classPrivateFieldGet(this, _Connection_callbacks, "f").get(object.id);
            // Callbacks could be all rejected if someone has called `.dispose()`.
            if (callback) {
                __classPrivateFieldGet(this, _Connection_callbacks, "f").delete(object.id);
                if (object.error) {
                    callback.reject(createProtocolError(callback.error, callback.method, object));
                }
                else {
                    callback.resolve(object.result);
                }
            }
        }
        else {
            this.emit(object.method, object.params);
        }
    }
    dispose() {
        __classPrivateFieldGet(this, _Connection_instances, "m", _Connection_onClose).call(this);
        __classPrivateFieldGet(this, _Connection_transport, "f").close();
    }
    /**
     * @param targetInfo - The target info
     * @returns The CDP session that is created
     */
    async createSession(targetInfo) {
        const { sessionId } = await this.send('Target.attachToTarget', {
            targetId: targetInfo.targetId,
            flatten: true,
        });
        const session = __classPrivateFieldGet(this, _Connection_sessions, "f").get(sessionId);
        if (!session) {
            throw new Error('CDPSession creation failed.');
        }
        return session;
    }
}
_Connection_url = new WeakMap(), _Connection_transport = new WeakMap(), _Connection_delay = new WeakMap(), _Connection_lastId = new WeakMap(), _Connection_sessions = new WeakMap(), _Connection_closed = new WeakMap(), _Connection_callbacks = new WeakMap(), _Connection_instances = new WeakSet(), _Connection_onClose = function _Connection_onClose() {
    if (__classPrivateFieldGet(this, _Connection_closed, "f")) {
        return;
    }
    __classPrivateFieldSet(this, _Connection_closed, true, "f");
    __classPrivateFieldGet(this, _Connection_transport, "f").onmessage = undefined;
    __classPrivateFieldGet(this, _Connection_transport, "f").onclose = undefined;
    for (const callback of __classPrivateFieldGet(this, _Connection_callbacks, "f").values()) {
        callback.reject(rewriteError(callback.error, `Protocol error (${callback.method}): Target closed.`));
    }
    __classPrivateFieldGet(this, _Connection_callbacks, "f").clear();
    for (const session of __classPrivateFieldGet(this, _Connection_sessions, "f").values()) {
        session._onClosed();
    }
    __classPrivateFieldGet(this, _Connection_sessions, "f").clear();
    this.emit(ConnectionEmittedEvents.Disconnected);
};
/**
 * Internal events that the CDPSession class emits.
 *
 * @internal
 */
export const CDPSessionEmittedEvents = {
    Disconnected: Symbol('CDPSession.Disconnected'),
};
/**
 * The `CDPSession` instances are used to talk raw Chrome Devtools Protocol.
 *
 * @remarks
 *
 * Protocol methods can be called with {@link CDPSession.send} method and protocol
 * events can be subscribed to with `CDPSession.on` method.
 *
 * Useful links: {@link https://chromedevtools.github.io/devtools-protocol/ | DevTools Protocol Viewer}
 * and {@link https://github.com/aslushnikov/getting-started-with-cdp/blob/HEAD/README.md | Getting Started with DevTools Protocol}.
 *
 * @example
 * ```ts
 * const client = await page.target().createCDPSession();
 * await client.send('Animation.enable');
 * client.on('Animation.animationCreated', () => console.log('Animation created!'));
 * const response = await client.send('Animation.getPlaybackRate');
 * console.log('playback rate is ' + response.playbackRate);
 * await client.send('Animation.setPlaybackRate', {
 *   playbackRate: response.playbackRate / 2
 * });
 * ```
 *
 * @public
 */
export class CDPSession extends EventEmitter {
    /**
     * @internal
     */
    constructor(connection, targetType, sessionId) {
        super();
        _CDPSession_sessionId.set(this, void 0);
        _CDPSession_targetType.set(this, void 0);
        _CDPSession_callbacks.set(this, new Map());
        _CDPSession_connection.set(this, void 0);
        __classPrivateFieldSet(this, _CDPSession_connection, connection, "f");
        __classPrivateFieldSet(this, _CDPSession_targetType, targetType, "f");
        __classPrivateFieldSet(this, _CDPSession_sessionId, sessionId, "f");
    }
    connection() {
        return __classPrivateFieldGet(this, _CDPSession_connection, "f");
    }
    send(method, ...paramArgs) {
        if (!__classPrivateFieldGet(this, _CDPSession_connection, "f")) {
            return Promise.reject(new Error(`Protocol error (${method}): Session closed. Most likely the ${__classPrivateFieldGet(this, _CDPSession_targetType, "f")} has been closed.`));
        }
        // See the comment in Connection#send explaining why we do this.
        const params = paramArgs.length ? paramArgs[0] : undefined;
        const id = __classPrivateFieldGet(this, _CDPSession_connection, "f")._rawSend({
            sessionId: __classPrivateFieldGet(this, _CDPSession_sessionId, "f"),
            method,
            params,
        });
        return new Promise((resolve, reject) => {
            __classPrivateFieldGet(this, _CDPSession_callbacks, "f").set(id, {
                resolve,
                reject,
                error: new ProtocolError(),
                method,
            });
        });
    }
    /**
     * @internal
     */
    _onMessage(object) {
        const callback = object.id ? __classPrivateFieldGet(this, _CDPSession_callbacks, "f").get(object.id) : undefined;
        if (object.id && callback) {
            __classPrivateFieldGet(this, _CDPSession_callbacks, "f").delete(object.id);
            if (object.error) {
                callback.reject(createProtocolError(callback.error, callback.method, object));
            }
            else {
                callback.resolve(object.result);
            }
        }
        else {
            assert(!object.id);
            this.emit(object.method, object.params);
        }
    }
    /**
     * Detaches the cdpSession from the target. Once detached, the cdpSession object
     * won't emit any events and can't be used to send messages.
     */
    async detach() {
        if (!__classPrivateFieldGet(this, _CDPSession_connection, "f")) {
            throw new Error(`Session already detached. Most likely the ${__classPrivateFieldGet(this, _CDPSession_targetType, "f")} has been closed.`);
        }
        await __classPrivateFieldGet(this, _CDPSession_connection, "f").send('Target.detachFromTarget', {
            sessionId: __classPrivateFieldGet(this, _CDPSession_sessionId, "f"),
        });
    }
    /**
     * @internal
     */
    _onClosed() {
        for (const callback of __classPrivateFieldGet(this, _CDPSession_callbacks, "f").values()) {
            callback.reject(rewriteError(callback.error, `Protocol error (${callback.method}): Target closed.`));
        }
        __classPrivateFieldGet(this, _CDPSession_callbacks, "f").clear();
        __classPrivateFieldSet(this, _CDPSession_connection, undefined, "f");
        this.emit(CDPSessionEmittedEvents.Disconnected);
    }
    /**
     * Returns the session's id.
     */
    id() {
        return __classPrivateFieldGet(this, _CDPSession_sessionId, "f");
    }
}
_CDPSession_sessionId = new WeakMap(), _CDPSession_targetType = new WeakMap(), _CDPSession_callbacks = new WeakMap(), _CDPSession_connection = new WeakMap();
function createProtocolError(error, method, object) {
    let message = `Protocol error (${method}): ${object.error.message}`;
    if ('data' in object.error) {
        message += ` ${object.error.data}`;
    }
    return rewriteError(error, message, object.error.message);
}
function rewriteError(error, message, originalMessage) {
    error.message = message;
    error.originalMessage = originalMessage !== null && originalMessage !== void 0 ? originalMessage : error.originalMessage;
    return error;
}
//# sourceMappingURL=Connection.js.map